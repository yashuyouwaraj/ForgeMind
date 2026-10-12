
import "dotenv/config";

import { logger } from "@forgemind/shared-logger";
import app, { gitOperations } from "./app.js";
import { createRepositoryImportedHandler } from "./events/repository-imported-handler.js";
import { KafkaEventPublisher } from "./events/kafka-event-publisher.js";
import { KafkaRepositoryEventConsumer } from "./events/repository-event-consumer.js";

const port = Number(process.env.PORT ?? 3004);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

const publisher = new KafkaEventPublisher();

const handleRepositoryImported = createRepositoryImportedHandler({
  gitOperations,
  publisher,
});

const consumer = new KafkaRepositoryEventConsumer(
  handleRepositoryImported,
);

let shuttingDown = false;

async function start(): Promise<void> {
  // Fail startup if Kafka cannot be initialized. This avoids running
  // an apparently healthy service that cannot process repository events.
  await consumer.start();

  const server = app.listen(port, () => {
    logger.info(
      { service: "git-service", port },
      "ForgeMind Git Service started",
    );
  });

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "Git Service shutdown requested");

    try {
      await consumer.close();

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      await publisher.close();
      logger.info("Git Service stopped");
    } catch (error) {
      logger.error({ err: error }, "Git Service shutdown failed");
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error: unknown) => {
  logger.error({ err: error }, "Git Service startup failed");
  process.exitCode = 1;

  void publisher.close().catch((closeError: unknown) => {
    logger.error({ err: closeError }, "Kafka publisher cleanup failed");
  });
});
