
import { createForgeMindApp } from "@forgemind/sdk";
import { GitOperations } from "./git/git-operations.js";
import { createGitRouter } from "./git/git.controller.js";
import { RepositoryAccessClient } from "./security/repository-access-client.js";
import { workspaceSchema } from "@forgemind/shared-config";

const workspaceEnvironment = workspaceSchema.parse({
  GIT_WORKSPACE_ROOT: process.env.GIT_WORKSPACE_ROOT,
});

export const gitOperations = new GitOperations({
  workspaceRoot: workspaceEnvironment.GIT_WORKSPACE_ROOT,
});

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
