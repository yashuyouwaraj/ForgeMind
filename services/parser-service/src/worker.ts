
import "dotenv/config";

import { logger } from "@forgemind/shared-logger";
import { KafkaRepositoryParseEventConsumer } from "./worker/repository-parse-event-consumer.js";

const worker = new KafkaRepositoryParseEventConsumer();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Parser Service shutdown requested");

  try {
    await worker.close();
    logger.info("Parser Service stopped");
  } catch (error) {
    logger.error({ err: error }, "Parser Service shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

worker
  .start()
  .then(() => {
    logger.info("Parser Service worker is running");
  })
  .catch(async (error: unknown) => {
    logger.error({ err: error }, "Parser Service startup failed");

    try {
      await worker.close();
    } catch (closeError) {
      logger.error({ err: closeError }, "Parser Service cleanup failed");
    }

    process.exitCode = 1;
  });
