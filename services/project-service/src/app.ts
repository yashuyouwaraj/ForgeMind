import {
  createForgeMindApp,
  errorHandler,
  notFoundHandler,
} from "@forgemind/sdk";
import type { ProjectService } from "./application/project-service.js";
import { createProjectRoutes } from "./api/project/project-routes.js";
import type { JwtService } from "./infrastructure/security/jwt-service.js";

export interface ProjectAppDependencies {
  projectService: ProjectService;
  jwtService: JwtService;
}

export function createProjectApp({
  projectService,
  jwtService,
}: ProjectAppDependencies) {
  const app = createForgeMindApp({
    serviceName: "project-service",
    requestLogging: true,
    cors: true,
    security: true,
    compression: true,
    apiPrefix: "/api",
    registerErrorHandlers: false,
  });

  app.use(
    "/api/projects",
    createProjectRoutes(projectService, jwtService),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}