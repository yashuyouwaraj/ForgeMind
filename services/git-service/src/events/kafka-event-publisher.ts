
import { Kafka, type Producer } from "kafkajs";
import type {
  RepositorySyncFailedEvent,
  RepositorySynchronizedEvent,
} from "@forgemind/shared-events";

export type RepositorySyncOutcome =
  | RepositorySynchronizedEvent
  | RepositorySyncFailedEvent;

export interface EventPublisher {
  publish(event: RepositorySyncOutcome): Promise<void>;
  close(): Promise<void>;
}

export class KafkaEventPublisher implements EventPublisher {
  private readonly producer: Producer;
  private connectPromise: Promise<void> | null = null;
  private connected = false;
  private closing = false;

  constructor(brokersValue = process.env.KAFKA_BROKERS) {
    const brokers = brokersValue
      ?.split(",")
      .map((broker) => broker.trim())
      .filter(Boolean);

    if (!brokers?.length) {
      throw new Error("KAFKA_BROKERS must contain at least one broker");
    }

    this.producer = new Kafka({
      clientId: "forgemind-git-service",
      brokers,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 5_000,
      },
    }).producer({
      allowAutoTopicCreation: false,
    });
  }

  async publish(event: RepositorySyncOutcome): Promise<void> {
    if (this.closing) {
      throw new Error("KAFKA_PUBLISHER_CLOSING");
    }

    await this.ensureConnected();

    await this.producer.send({
      topic: "repository.events",
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

  async close(): Promise<void> {
    this.closing = true;

    if (this.connectPromise) {
      try {
        await this.connectPromise;
      } catch {
        // Continue shutdown if connection failed.
      }
    }

    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;

    if (!this.connectPromise) {
      this.connectPromise = this.producer
        .connect()
        .then(() => {
          this.connected = true;
        })
        .finally(() => {
          this.connectPromise = null;
        });
    }

    await this.connectPromise;
  }
}
