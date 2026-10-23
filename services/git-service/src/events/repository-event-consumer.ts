import {
  Kafka,
  type Consumer,
  type EachMessagePayload,
  type Producer,
} from "kafkajs";
import { logger } from "@forgemind/shared-logger";

export interface RepositoryImportedHandler {
  (event: unknown): Promise<void>;
}

export interface RepositoryEventConsumer {
  start(): Promise<void>;
  close(): Promise<void>;
}

export interface KafkaConsumerOptions {
  maxProcessingAttempts?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  deadLetterTopic?: string;
  sleep?: (milliseconds: number) => Promise<void>;
}

const PERMANENT_PROCESSING_ERRORS = new Set([
  "INVALID_REPOSITORY_IMPORTED_EVENT",
  "INVALID_REPOSITORY_SYNC_REQUESTED_EVENT",
  "INVALID_REPOSITORY_EVENT",
  "INVALID_REPOSITORY_EVENT_JSON",
]);

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return "REPOSITORY_EVENT_PROCESSING_FAILED";

  // Only stable machine-readable codes are exposed to logs and dead letters.
  return /^[A-Z][A-Z0-9_]{0,99}$/.test(error.message)
    ? error.message
    : "REPOSITORY_EVENT_PROCESSING_FAILED";
}

function decodeEvent(value: Buffer | null): unknown {
  if (!value) throw new Error("INVALID_REPOSITORY_EVENT_JSON");

  try {
    return JSON.parse(value.toString("utf8")) as unknown;
  } catch {
    throw new Error("INVALID_REPOSITORY_EVENT_JSON");
  }
}

function eventType(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;

  const type = (value as Record<string, unknown>).eventType;
  return typeof type === "string" ? type : null;
}

export class KafkaRepositoryEventConsumer implements RepositoryEventConsumer {
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private readonly deadLetterTopic: string;
  private readonly maxProcessingAttempts: number;
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  private started = false;
  private closing = false;
  private startPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;

  constructor(
    private readonly handler: RepositoryImportedHandler,
    brokersValue = process.env.KAFKA_BROKERS,
    groupId = process.env.GIT_SERVICE_CONSUMER_GROUP ?? "forgemind-git-service",
    options: KafkaConsumerOptions = {},
  ) {
    const brokers = brokersValue
      ?.split(",")
      .map((broker) => broker.trim())
      .filter(Boolean);

    if (!brokers?.length) {
      throw new Error("KAFKA_BROKERS must contain at least one broker");
    }

    if (!groupId.trim()) {
      throw new Error("GIT_SERVICE_CONSUMER_GROUP is required");
    }

    this.maxProcessingAttempts = options.maxProcessingAttempts ?? 3;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 500;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 5_000;
    this.deadLetterTopic = options.deadLetterTopic ?? "repository.events.dlq";
    this.sleep = options.sleep ?? sleep;

    if (
      !Number.isInteger(this.maxProcessingAttempts) ||
      this.maxProcessingAttempts < 1 ||
      this.maxProcessingAttempts > 10
    ) {
      throw new Error("INVALID_KAFKA_PROCESSING_ATTEMPTS");
    }

    if (
      !Number.isFinite(this.initialRetryDelayMs) ||
      this.initialRetryDelayMs < 0 ||
      !Number.isFinite(this.maxRetryDelayMs) ||
      this.maxRetryDelayMs < this.initialRetryDelayMs
    ) {
      throw new Error("INVALID_KAFKA_RETRY_DELAY");
    }

    if (!this.deadLetterTopic.trim()) {
      throw new Error("KAFKA_DEAD_LETTER_TOPIC_REQUIRED");
    }

    const kafka = new Kafka({
      clientId: "forgemind-git-service",
      brokers,
      retry: {
        retries: 8,
        initialRetryTime: 300,
        maxRetryTime: 10_000,
      },
    });

    this.consumer = kafka.consumer({
      groupId,
      allowAutoTopicCreation: false,
    });

    this.producer = kafka.producer({
      allowAutoTopicCreation: false,
    });
  }

  async start(): Promise<void> {
    if (this.closing) throw new Error("KAFKA_CONSUMER_CLOSING");
    if (this.started) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startInternal();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async startInternal(): Promise<void> {
    await this.consumer.connect();

    try {
      await this.producer.connect();
      await this.consumer.subscribe({
        topic: "repository.events",
        fromBeginning: false,
      });

      await this.consumer.run({
        autoCommit: false,
        eachMessage: async (payload) => {
          await this.processMessage(payload);
        },
      });

      this.started = true;
      logger.info("Git Service Kafka consumer started");
    } catch (error) {
      await Promise.allSettled([
        this.consumer.disconnect(),
        this.producer.disconnect(),
      ]);
      throw error;
    }
  }

  private async processMessage({
    topic,
    partition,
    message,
  }: EachMessagePayload): Promise<void> {
    if (this.closing) {
      throw new Error("KAFKA_CONSUMER_CLOSING");
    }

    if (topic !== "repository.events") {
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    let event: unknown;

    try {
      event = decodeEvent(message.value);
    } catch (error) {
      await this.deadLetter(topic, partition, message, errorCode(error));
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    const type = eventType(event);

    // Outcome events are published to the same topic. They are not inputs
    // to this consumer's Git workflow.

    // These events belong to other workflow stages. They share the
    // repository event stream but are not inputs to Git operations.

    const unrelatedEventTypes = new Set([
      "RepositorySynchronized",
      "RepositorySyncFailed",
      "RepositoryParseRequested",
      "RepositoryParsed",
      "RepositoryParseFailed",
    ]);

    if (type && unrelatedEventTypes.has(type)) {
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    if (type !== "RepositoryImported" && type !== "RepositorySyncRequested") {
      await this.deadLetter(
        topic,
        partition,
        message,
        "UNSUPPORTED_REPOSITORY_EVENT_TYPE",
      );
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    for (let attempt = 1; attempt <= this.maxProcessingAttempts; attempt += 1) {
      try {
        await this.handler(event);
        await this.commitOffset(topic, partition, message.offset);
        return;
      } catch (error) {
        const code = errorCode(error);
        const permanent = PERMANENT_PROCESSING_ERRORS.has(code);
        const exhausted = attempt === this.maxProcessingAttempts;

        if (permanent || exhausted) {
          // If DLQ publication fails, this throws and the input offset stays
          // uncommitted so the original event can be retried.
          await this.deadLetter(topic, partition, message, code);
          await this.commitOffset(topic, partition, message.offset);
          return;
        }

        const delayMs = Math.min(
          this.initialRetryDelayMs * 2 ** (attempt - 1),
          this.maxRetryDelayMs,
        );

        logger.warn(
          { attempt, delayMs, errorCode: code },
          "Repository event processing failed; retrying",
        );

        await this.sleep(delayMs);
      }
    }
  }

  private async deadLetter(
    topic: string,
    partition: number,
    message: EachMessagePayload["message"],
    failureCode: string,
  ): Promise<void> {
    const deadLetteredAt = new Date().toISOString();

    // Do not copy the original payload, message key, or arbitrary headers.
    // They may contain credentials, repository URLs, or untrusted data.
    const deadLetterRecord = {
      sourceTopic: topic,
      sourcePartition: partition,
      sourceOffset: message.offset,
      failureCode,
      deadLetteredAt,
    };

    // Keep the original message uncommitted if publication fails.
    // The caller must commit the source offset only after this succeeds.
    await this.producer.send({
      topic: this.deadLetterTopic,
      acks: -1,
      messages: [
        {
          value: JSON.stringify(deadLetterRecord),
          headers: {
            failureCode,
            sourceTopic: topic,
            sourcePartition: String(partition),
            sourceOffset: message.offset,
          },
        },
      ],
    });

    logger.error(
      {
        failureCode,
        sourceTopic: topic,
        sourcePartition: partition,
        sourceOffset: message.offset,
      },
      "Repository event moved to dead-letter topic",
    );
  }

  private async commitOffset(
    topic: string,
    partition: number,
    offset: string,
  ): Promise<void> {
    await this.consumer.commitOffsets([
      {
        topic,
        partition,
        offset: (BigInt(offset) + 1n).toString(),
      },
    ]);
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;

    this.closing = true;
    this.closePromise = this.closeInternal();
    return this.closePromise;
  }

  private async closeInternal(): Promise<void> {
    if (this.startPromise) {
      await this.startPromise.catch(() => undefined);
    }

    const operations: Promise<unknown>[] = [];

    if (this.started) {
      operations.push(this.consumer.stop());
    }

    operations.push(this.consumer.disconnect());
    operations.push(this.producer.disconnect());

    const results = await Promise.allSettled(operations);
    this.started = false;

    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (failure) throw failure.reason;
  }
}
