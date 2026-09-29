import { JwtService } from "./infrastructure/security/jwt-service.js";
import { ProjectRepository } from "./repositories/project-repository.js";
import { ProjectService } from "./application/project-service.js";
import { createProjectApp } from "./app.js";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be configured and contain at least 32 characters",
  );
}

const jwtService = new JwtService(jwtSecret);
const projectRepository = new ProjectRepository();
const projectService = new ProjectService(projectRepository);

const app = createProjectApp({
  projectService,
  jwtService,
});

const port = Number(process.env.PORT ?? 3002);

app.listen(port, () => {
  console.log(`ForgeMind Project Service running on port ${port}`);
});