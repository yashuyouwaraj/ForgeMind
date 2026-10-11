
import "dotenv/config";

import { logger } from "@forgemind/shared-logger";
import app from "./app.js";

const port = Number(process.env.PORT ?? 3004);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

const server = app.listen(port, () => {
  logger.info(
    { service: "git-service", port },
    "ForgeMind Git Service started",
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Git Service shutdown requested");

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Git Service shutdown failed");
      process.exitCode = 1;
      return;
    }

    logger.info("Git Service stopped");
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
