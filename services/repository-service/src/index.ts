
import "dotenv/config";

import { JwtService } from "./infrastructure/security/jwt-service.js";
import { ProjectAccessClient } from "./infrastructure/security/project-access-client.js";
import { RepositoryRepository } from "./repositories/repository-repository.js";
import { RepositoryService } from "./application/repository-service.js";
import { createRepositoryApp } from "./app.js";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be configured and contain at least 32 characters",
  );
}

const jwtService = new JwtService(jwtSecret);

const projectServiceUrl =
  process.env.PROJECT_SERVICE_URL ?? "http://localhost:3002";

const projectAccessClient = new ProjectAccessClient(
  projectServiceUrl,
);

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

app.listen(port, () => {
  console.log(
    `ForgeMind Repository Service running on port ${port}`,
  );
});
