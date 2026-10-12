
import { createForgeMindApp } from "@forgemind/sdk";
import { GitOperations } from "./git/git-operations.js";
import { createGitRouter } from "./git/git.controller.js";
import { RepositoryAccessClient } from "./security/repository-access-client.js";

export const gitOperations = new GitOperations();
export const repositoryAccessClient = new RepositoryAccessClient();

const app = createForgeMindApp({
  serviceName: "git-service",
  registerRoutes(app) {
    app.use(
      "/api/git",
      createGitRouter({
        gitOperations,
        repositoryAccessClient,
      }),
    );
  },
});

export default app;
