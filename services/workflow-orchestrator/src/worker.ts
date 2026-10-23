import "dotenv/config";
import { Kafka } from "kafkajs";
import { DueRetryDispatcher } from "./application/due-retry-dispatcher.js";
import { RepositoryEventProcessor } from "./application/repository-event-processor.js";
import { prisma, disconnectPrisma } from "./infrastructure/database/prisma.js";
import { RepositoryEventConsumer } from "./infrastructure/messaging/repository-event-consumer.js";
import { WorkflowOutboxPublisher } from "./infrastructure/messaging/workflow-outbox-publisher.js";

function requiredBrokers(): string[] {
  const value = process.env.KAFKA_BROKERS;

  if (!value?.trim()) {
    throw new Error("KAFKA_BROKERS must be configured.");
  }

  const brokers = value
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);

  if (brokers.length === 0) {
    throw new Error("KAFKA_BROKERS must contain at least one broker.");
  }

  return brokers;
}

async function main(): Promise<void> {
  const topic = process.env.REPOSITORY_EVENTS_TOPIC ?? "repository.events";
  const deadLetterTopic =
    process.env.REPOSITORY_EVENTS_DLQ_TOPIC ?? "repository.events.dlq";
  const consumerGroup =
    process.env.WORKFLOW_ORCHESTRATOR_CONSUMER_GROUP ??
    "forgemind-workflow-orchestrator";

  const kafka = new Kafka({
    clientId: "forgemind-workflow-orchestrator",
    brokers: requiredBrokers(),
  });

  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: consumerGroup });

  await producer.connect();

  const processor = new RepositoryEventProcessor(prisma);

  const eventConsumer = new RepositoryEventConsumer(
    consumer,
    producer,
    processor,
    { topic, deadLetterTopic },
  );

  const retryDispatcher = new DueRetryDispatcher(prisma);
  const outboxPublisher = new WorkflowOutboxPublisher(prisma, producer, {
    topic,
    deadLetterTopic,
  });

  let stopping = false;
  let activeTick: Promise<void> | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;

    console.info(`[workflow-worker] Received ${signal}; shutting down.`);

    if (interval) clearInterval(interval);

    if (activeTick) {
      console.info("[workflow-worker] Waiting for the active worker tick.");

      try {
        await activeTick;
      } catch (error) {
        console.error(
          "[workflow-worker] Active worker tick failed during shutdown.",
          error,
        );
      }
    }

    try {
      await eventConsumer.stop();
    } catch (error) {
      console.error("[workflow-worker] Consumer shutdown failed.", error);
    }

    try {
      await producer.disconnect();
    } catch (error) {
      console.error("[workflow-worker] Producer shutdown failed.", error);
    }

    try {
      await disconnectPrisma();
    } catch (error) {
      console.error("[workflow-worker] Database shutdown failed.", error);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  interval = setInterval(() => {
    if (stopping || activeTick) return;

    activeTick = (async () => {
      try {
        const retries = await retryDispatcher.dispatchDueRetries();
        if (retries.dispatched > 0 || retries.invalid > 0) {
          console.info("[workflow-worker] Due retries processed.", retries);
        }

      } catch (error) {
        console.error("[workflow-worker] Retry dispatch failed.", error);
      }

      try {
        const result = await outboxPublisher.publishBatch();
        if (result.claimed > 0) {
          console.info("[workflow-worker] Outbox batch completed.", result);
        }
      } catch (error) {
        console.error("[workflow-worker] Outbox batch failed.", error);
      }
    })().finally(() => {
      activeTick = null;
    });
  }, 1_000);

  console.info("[workflow-worker] Starting.", {
    topic,
    deadLetterTopic,
    consumerGroup,
  });

  try {
    await eventConsumer.start();
  } catch (error) {
    console.error("[workflow-worker] Consumer stopped unexpectedly.", error);
    await shutdown("consumer-error");
    process.exitCode = 1;
  }
}

main().catch(async (error: unknown) => {
  console.error("[workflow-worker] Startup failed.", error);

  try {
    await disconnectPrisma();
  } catch (disconnectError) {
    console.error(
      "[workflow-worker] Database cleanup failed.",
      disconnectError,
    );
  }

  process.exitCode = 1;
});
