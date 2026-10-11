
import "dotenv/config";

import { JwtService } from "./infrastructure/security/jwt-service.js";
import { ProjectAccessClient } from "./infrastructure/security/project-access-client.js";
import { RepositoryRepository } from "./repositories/repository-repository.js";
import { RepositoryService } from "./application/repository-service.js";
import { createRepositoryApp } from "./app.js";
import { OutboxRepository } from "./infrastructure/outbox/outbox-repository.js";
import { KafkaEventPublisher } from "./infrastructure/outbox/kafka-event-publisher.js";
import { OutboxWorker } from "./infrastructure/outbox/outbox-worker.js";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be configured and contain at least 32 characters",
  );
}

const jwtService = new JwtService(jwtSecret);

const projectServiceUrl =
  process.env.PROJECT_SERVICE_URL ?? "http://localhost:3002";

const projectAccessClient = new ProjectAccessClient(projectServiceUrl);

const repositoryRepository = new RepositoryRepository();
const repositoryService = new RepositoryService(repositoryRepository);

const app = createRepositoryApp({
  repositoryService,
  jwtService,
  projectAccessClient,
});

const port = Number(process.env.PORT ?? 3003);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

// Kafka connects lazily when the worker publishes its first event.
const outboxRepository = new OutboxRepository();
const eventPublisher = new KafkaEventPublisher();
const outboxWorker = new OutboxWorker(
  outboxRepository,
  eventPublisher,
  {
    batchSize: 20,
    pollIntervalMs: 1_000,
    onError: (message, error) => {
      console.error(`[repository-service] ${message}`, error);
    },
  },
);

const server = app.listen(port, () => {
  console.log(
    `ForgeMind Repository Service running on port ${port}`,
  );

  outboxWorker.start();
  console.log("[repository-service] Outbox worker started");
});

let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    console.log(`[repository-service] Received ${signal}; shutting down`);

    // Stop accepting HTTP requests and allow in-flight requests to finish.
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    // Finish the current worker iteration before disconnecting Kafka.
    await outboxWorker.stop();

    console.log("[repository-service] Shutdown complete");
  })();

  return shutdownPromise;
}

process.once("SIGINT", () => {
  void shutdown("SIGINT").catch((error: unknown) => {
    console.error("[repository-service] Shutdown failed", error);
    process.exitCode = 1;
  });
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM").catch((error: unknown) => {
    console.error("[repository-service] Shutdown failed", error);
    process.exitCode = 1;
  });
});

server.on("error", (error) => {
  console.error("[repository-service] HTTP server error", error);
  process.exitCode = 1;
});
