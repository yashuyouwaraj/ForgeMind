
import {
  createForgeMindApp,
  errorHandler,
  notFoundHandler,
} from "@forgemind/sdk";
import type { RepositoryService } from "./application/repository-service.js";
import type { JwtService } from "./infrastructure/security/jwt-service.js";
import type { ProjectAccessClient } from "./infrastructure/security/project-access-client.js";
import { createRepositoryRoutes } from "./api/repository/repository-routes.js";

export interface RepositoryAppDependencies {
  repositoryService: RepositoryService;
  jwtService: JwtService;
  projectAccessClient: ProjectAccessClient;
}

export function createRepositoryApp({
  repositoryService,
  jwtService,
  projectAccessClient,
}: RepositoryAppDependencies) {
  const app = createForgeMindApp({
    serviceName: "repository-service",
    requestLogging: true,
    cors: true,
    security: true,
    compression: true,
    apiPrefix: "/api",
    registerErrorHandlers: false,
  });

  app.use(
    "/api/repositories",
    createRepositoryRoutes(
      repositoryService,
      jwtService,
      projectAccessClient,
    ),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
