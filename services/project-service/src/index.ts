import "dotenv/config";

import { JwtService } from "./infrastructure/security/jwt-service.js";
import { ProjectRepository } from "./repositories/project-repository.js";
import { ProjectService } from "./application/project-service.js";
import { createProjectApp } from "./app.js";
import { ProjectMembershipRepository } from "./repositories/project-membership-repository.js";
import { ProjectMembershipService } from "./application/project-membership-service.js";

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be configured and contain at least 32 characters",
  );
}

const jwtService = new JwtService(jwtSecret);
const projectRepository = new ProjectRepository();
const projectService = new ProjectService(projectRepository);
const projectMembershipRepository =
  new ProjectMembershipRepository();

const projectMembershipService =
  new ProjectMembershipService(
    projectMembershipRepository,
    projectRepository,
  );

const app = createProjectApp({
  projectService,
  projectMembershipService,
  jwtService,
});
const port = Number(process.env.PORT ?? 3002);

app.listen(port, () => {
  console.log(`ForgeMind Project Service running on port ${port}`);
});