
import { Kafka, type Consumer } from "kafkajs";
import { logger } from "@forgemind/shared-logger";

export interface RepositoryImportedHandler {
  (event: unknown): Promise<void>;
}

export interface RepositoryEventConsumer {
  start(): Promise<void>;
  close(): Promise<void>;
}

export class KafkaRepositoryEventConsumer
  implements RepositoryEventConsumer
{
  private readonly consumer: Consumer;
  private started = false;
  private closing = false;

  constructor(
    private readonly handler: RepositoryImportedHandler,
    brokersValue = process.env.KAFKA_BROKERS,
    groupId = process.env.GIT_SERVICE_CONSUMER_GROUP ??
      "forgemind-git-service",
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

    this.consumer = new Kafka({
      clientId: "forgemind-git-service",
      brokers,
      retry: {
        retries: 8,
        initialRetryTime: 300,
        maxRetryTime: 10_000,
      },
    }).consumer({
      groupId,
      allowAutoTopicCreation: false,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: "repository.events",
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        if (this.closing) return;

        if (topic !== "repository.events") return;

        if (!message.value) {
          throw new Error("EMPTY_REPOSITORY_EVENT");
        }

        let event: unknown;

        try {
          event = JSON.parse(message.value.toString("utf8"));
        } catch {
          throw new Error("INVALID_REPOSITORY_EVENT_JSON");
        }

        if (
          typeof event !== "object" ||
          event === null ||
          !("eventType" in event)
        ) {
          throw new Error("INVALID_REPOSITORY_EVENT");
        }

        // The topic carries both imported and outcome events.
        // Only imported events initiate Git operations.
        if (event.eventType !== "RepositoryImported") {
          await this.commitOffset(topic, partition, message.offset);
          return;
        }

        // Do not commit the input offset unless the handler completes.
        // Handler errors propagate so the consumer cannot silently discard
        // an event whose outcome could not be published.
        await this.handler(event);

        await this.commitOffset(topic, partition, message.offset);
      },
    });

    this.started = true;
    logger.info("Git Service Kafka consumer started");
  }

  async close(): Promise<void> {
    if (this.closing) return;

    this.closing = true;

    if (this.started) {
      await this.consumer.stop();
    }

    await this.consumer.disconnect();
    this.started = false;
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
}
