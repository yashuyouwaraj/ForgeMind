import { ProjectService } from "./application/project-service.js";
import { createProjectRoutes } from "./api/project/project-routes.js";
import { JwtService } from "./infrastructure/security/jwt-service.js";
import { ProjectRepository } from "./repositories/project-repository.js";
import {createForgeMindApp,errorHandler,notFoundHandler} from "@forgemind/sdk";

const app = createForgeMindApp({
  serviceName: "project-service",
  requestLogging: true,
  cors: true,
  security: true,
  compression: true,
  apiPrefix: "/api",
  registerErrorHandlers: false,
});

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be configured and contain at least 32 characters",
  );
}

const jwtService = new JwtService(jwtSecret);
const projectRepository = new ProjectRepository();
const projectService = new ProjectService(projectRepository);
const projectRouter = createProjectRoutes(projectService, jwtService);

app.use("/api/projects", projectRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 3002);

app.listen(port, () => {
  console.log(`ForgeMind Project Service running on port ${port}`);
});
