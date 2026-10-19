import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";
import path from "node:path";

import {
  Kafka,
  type Consumer,
  type EachMessagePayload,
  type Producer,
} from "kafkajs";

import type {
  RepositoryParseRequestedEvent,
  RepositoryParsedEvent,
  RepositoryParseFailedEvent,
} from "@forgemind/shared-events";
import { logger } from "@forgemind/shared-logger";
import { RepositoryParser } from "../parsing/repository-parser.js";

const execFile = promisify(execFileCallback);

const TOPIC = "repository.events";
const DLQ_TOPIC = "repository.events.dlq";

const PERMANENT_FAILURES = new Set([
  "INVALID_REPOSITORY_PARSE_REQUEST",
  "INVALID_REPOSITORY_ID",
  "INVALID_HEAD_COMMIT",
  "WORKSPACE_HEAD_COMMIT_MISMATCH",
  "WORKSPACE_PATH_OUTSIDE_ROOT",
]);

interface WorkerOptions {
  readonly brokers?: string;
  readonly groupId?: string;
  readonly workspaceRoot?: string;
  readonly maxAttempts?: number;
  readonly initialRetryDelayMs?: number;
  readonly maxRetryDelayMs?: number;
  readonly parser?: RepositoryParser;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stableEventId(sourceEventId: string, outcome: string): string {
  return createHash("sha256")
    .update(`${sourceEventId}:${outcome}:v1`)
    .digest("hex");
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return "REPOSITORY_PARSE_FAILED";

  return /^[A-Z][A-Z0-9_]{0,99}$/.test(error.message)
    ? error.message
    : "REPOSITORY_PARSE_FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function decodeRequest(
  value: Buffer | null,
): RepositoryParseRequestedEvent {
  if (!value) {
    throw new Error("INVALID_REPOSITORY_PARSE_REQUEST");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value.toString("utf8")) as unknown;
  } catch {
    throw new Error("INVALID_REPOSITORY_PARSE_REQUEST");
  }

  if (!isRecord(parsed) || !isRecord(parsed.data)) {
    throw new Error("INVALID_REPOSITORY_PARSE_REQUEST");
  }

  const data = parsed.data;

  if (
    parsed.eventType !== "RepositoryParseRequested" ||
    parsed.eventVersion !== 1 ||
    !isNonEmptyString(parsed.eventId) ||
    !isNonEmptyString(parsed.correlationId) ||
    !isNonEmptyString(parsed.traceId) ||
    !isTimestamp(parsed.occurredAt) ||
    !isNonEmptyString(data.repositoryId) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(data.repositoryId) ||
    !isNonEmptyString(data.projectId) ||
    !isNonEmptyString(data.ownerId) ||
    !isTimestamp(data.requestedAt) ||
    typeof data.headCommit !== "string" ||
    !/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(data.headCommit)
  ) {
    throw new Error("INVALID_REPOSITORY_PARSE_REQUEST");
  }

  return parsed as unknown as RepositoryParseRequestedEvent;
}

export function isInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export class KafkaRepositoryParseEventConsumer {
  private readonly consumer: Consumer;
  private readonly producer: Producer;
  private readonly workspaceRoot: string;
  private readonly maxAttempts: number;
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly parser: RepositoryParser;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  private started = false;
  private closing = false;
  private consumerConnected = false;
  private producerConnected = false;

  constructor(options: WorkerOptions = {}) {
    const brokers = (options.brokers ?? process.env.KAFKA_BROKERS)
      ?.split(",")
      .map((broker) => broker.trim())
      .filter(Boolean);

    if (!brokers?.length) {
      throw new Error("KAFKA_BROKERS must contain at least one broker");
    }

    const groupId =
      options.groupId ??
      process.env.PARSER_SERVICE_CONSUMER_GROUP ??
      "forgemind-parser-service";

    if (!groupId.trim()) {
      throw new Error("PARSER_SERVICE_CONSUMER_GROUP is required");
    }

    const workspaceRoot =
      options.workspaceRoot ?? process.env.GIT_WORKSPACE_ROOT;

    if (!workspaceRoot?.trim()) {
      throw new Error("GIT_WORKSPACE_ROOT is required");
    }

    this.workspaceRoot = path.resolve(workspaceRoot);
    this.maxAttempts = options.maxAttempts ?? 3;
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? 500;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 5_000;
    this.parser = options.parser ?? new RepositoryParser();
    this.sleep = options.sleep ?? sleep;

    if (
      !Number.isInteger(this.maxAttempts) ||
      this.maxAttempts < 1 ||
      this.maxAttempts > 10
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

    const kafka = new Kafka({
      clientId: "forgemind-parser-service",
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
    if (this.closing) throw new Error("PARSER_WORKER_CLOSING");
    if (this.started) return;

    await this.consumer.connect();

    try {
      await this.producer.connect();
      this.producerConnected = true;

      await this.consumer.subscribe({
        topic: TOPIC,
        fromBeginning: false,
      });

      await this.consumer.run({
        autoCommit: false,
        eachMessage: async (payload) => this.processMessage(payload),
      });

      this.started = true;
      logger.info("Parser Service Kafka worker started");
    } catch (error) {
      const cleanup: Promise<unknown>[] = [];

      if (this.consumerConnected) {
        cleanup.push(this.consumer.disconnect());
      }

      if (this.producerConnected) {
        cleanup.push(this.producer.disconnect());
      }

      await Promise.allSettled(cleanup);

      this.consumerConnected = false;
      this.producerConnected = false;
      this.started = false;

      throw error;
    }
  }

  private async processMessage({
    topic,
    partition,
    message,
  }: EachMessagePayload): Promise<void> {
    if (this.closing) throw new Error("PARSER_WORKER_CLOSING");

    if (topic !== TOPIC) {
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    let raw: unknown;

    try {
      if (!message.value) throw new Error("INVALID_REPOSITORY_EVENT_JSON");
      raw = JSON.parse(message.value.toString("utf8")) as unknown;
    } catch {
      await this.deadLetter(
        topic,
        partition,
        message,
        "INVALID_REPOSITORY_EVENT_JSON",
      );
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    if (!isRecord(raw) || typeof raw.eventType !== "string") {
      await this.deadLetter(
        topic,
        partition,
        message,
        "INVALID_REPOSITORY_EVENT",
      );
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    if (raw.eventType !== "RepositoryParseRequested") {
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    let event: RepositoryParseRequestedEvent;

    try {
      event = decodeRequest(message.value);
    } catch (error) {
      await this.deadLetter(topic, partition, message, errorCode(error));
      await this.commitOffset(topic, partition, message.offset);
      return;
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await this.parseAndPublish(event);
        await this.commitOffset(topic, partition, message.offset);

        logger.info(
          {
            repositoryId: event.data.repositoryId,
            headCommit: event.data.headCommit,
            correlationId: event.correlationId,
          },
          "Repository parsing completed",
        );

        return;
      } catch (error) {
        const code = errorCode(error);
        const permanent = PERMANENT_FAILURES.has(code);
        const exhausted = attempt === this.maxAttempts;

        if (permanent || exhausted) {
          // If publishing the failure event fails, leave the input uncommitted.
          await this.publishFailure(event, code, !permanent);
          await this.commitOffset(topic, partition, message.offset);

          logger.error(
            {
              repositoryId: event.data.repositoryId,
              failureCode: code,
              attempt,
            },
            "Repository parsing failed",
          );

          return;
        }

        const delayMs = Math.min(
          this.initialRetryDelayMs * 2 ** (attempt - 1),
          this.maxRetryDelayMs,
        );

        logger.warn(
          {
            repositoryId: event.data.repositoryId,
            attempt,
            delayMs,
            failureCode: code,
          },
          "Repository parsing failed; retrying",
        );

        await this.sleep(delayMs);
      }
    }
  }

  private async parseAndPublish(
    event: RepositoryParseRequestedEvent,
  ): Promise<void> {
    const root = await realpath(this.workspaceRoot);
    const candidate = path.resolve(root, event.data.repositoryId);

    if (!isInsideRoot(root, candidate)) {
      throw new Error("WORKSPACE_PATH_OUTSIDE_ROOT");
    }

    const repositoryRoot = await realpath(candidate);

    if (!isInsideRoot(root, repositoryRoot)) {
      throw new Error("WORKSPACE_PATH_OUTSIDE_ROOT");
    }

    // Never report a successful parse for a different checkout.
    const { stdout } = await execFile(
      "git",
      ["-C", repositoryRoot, "rev-parse", "HEAD"],
      { timeout: 10_000, windowsHide: true },
    );

    const actualCommit = stdout.trim().toLowerCase();
    const requestedCommit = event.data.headCommit.toLowerCase();

    if (actualCommit !== requestedCommit) {
      throw new Error("WORKSPACE_HEAD_COMMIT_MISMATCH");
    }

    const result = await this.parser.parseRepository(repositoryRoot);

    const output: RepositoryParsedEvent = {
      eventId: stableEventId(event.eventId, "RepositoryParsed"),
      eventType: "RepositoryParsed",
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: event.correlationId,
      traceId: event.traceId,
      data: {
        repositoryId: event.data.repositoryId,
        projectId: event.data.projectId,
        ownerId: event.data.ownerId,
        headCommit: event.data.headCommit,
        completedAt: new Date().toISOString(),
        summary: result.summary,
      },
    };

    await this.publish(output);
  }

  private async publishFailure(
    event: RepositoryParseRequestedEvent,
    failureCode: string,
    retryable: boolean,
  ): Promise<void> {
    const output: RepositoryParseFailedEvent = {
      eventId: stableEventId(
        event.eventId,
        `RepositoryParseFailed:${failureCode}`,
      ),
      eventType: "RepositoryParseFailed",
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: event.correlationId,
      traceId: event.traceId,
      data: {
        repositoryId: event.data.repositoryId,
        projectId: event.data.projectId,
        ownerId: event.data.ownerId,
        headCommit: event.data.headCommit,
        failureCode,
        retryable,
      },
    };

    await this.publish(output);
  }

  private async publish(
    event: RepositoryParsedEvent | RepositoryParseFailedEvent,
  ): Promise<void> {
    await this.producer.send({
      topic: TOPIC,
      acks: -1,
      messages: [
        {
          key: event.data.repositoryId,
          value: JSON.stringify(event),
          headers: {
            eventId: event.eventId,
            eventType: event.eventType,
            correlationId: event.correlationId,
            traceId: event.traceId,
          },
        },
      ],
    });
  }

  private async deadLetter(
    topic: string,
    partition: number,
    message: EachMessagePayload["message"],
    failureCode: string,
  ): Promise<void> {
    await this.producer.send({
      topic: DLQ_TOPIC,
      acks: -1,
      messages: [
        {
          value: JSON.stringify({
            sourceTopic: topic,
            sourcePartition: partition,
            sourceOffset: message.offset,
            failureCode,
            deadLetteredAt: new Date().toISOString(),
          }),
          headers: {
            failureCode,
            sourceTopic: topic,
            sourcePartition: String(partition),
            sourceOffset: message.offset,
          },
        },
      ],
    });
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
    if (this.closing) return;
    this.closing = true;

    const errors: unknown[] = [];

    // Stop consumption before disconnecting the consumer.
    if (this.started) {
      try {
        await this.consumer.stop();
      } catch (error) {
        errors.push(error);
      }
    }

    const cleanup: Promise<unknown>[] = [];

    if (this.consumerConnected) {
      cleanup.push(this.consumer.disconnect());
    }

    if (this.producerConnected) {
      cleanup.push(this.producer.disconnect());
    }

    const results = await Promise.allSettled(cleanup);

    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(result.reason);
      }
    }

    this.started = false;
    this.consumerConnected = false;
    this.producerConnected = false;

    if (errors.length > 0) {
      throw errors[0];
    }
  }
}
