import "dotenv/config";

import { logger } from "@forgemind/shared-logger";
import app, { gitOperations } from "./app.js";
import { createRepositoryImportedHandler } from "./events/repository-imported-handler.js";
import { KafkaEventPublisher } from "./events/kafka-event-publisher.js";
import { KafkaRepositoryEventConsumer } from "./events/repository-event-consumer.js";
import { createGitServiceRuntime } from "./runtime.js";

const port = Number(process.env.PORT ?? 3004);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

const publisher = new KafkaEventPublisher();

const handleRepositoryImported = createRepositoryImportedHandler({
  gitOperations,
  publisher,
});

const consumer = new KafkaRepositoryEventConsumer(handleRepositoryImported);

const runtime = createGitServiceRuntime({
  listen: (requestedPort) => app.listen(requestedPort),
  consumer,
  publisher,
  port,
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Git Service shutdown requested");

  try {
    await runtime.stop();
    logger.info("Git Service stopped");
  } catch (error) {
    logger.error({ err: error }, "Git Service shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

runtime
  .start()
  .then(() => {
    logger.info({ port }, "Git Service HTTP server listening");
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, "Git Service startup failed");
    process.exitCode = 1;
  });
