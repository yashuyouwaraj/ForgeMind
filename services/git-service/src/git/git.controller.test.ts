import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { errorHandler } from "@forgemind/sdk";
import {
  NotFoundError,
  ServiceUnavailableError,
} from "@forgemind/shared-errors";
import { GitOperations } from "./git-operations.js";
import { RepositoryAccessClient } from "../security/repository-access-client.js";
import { createGitRouter } from "./git.controller.js";

const JWT_SECRET = "git-service-controller-test-secret-123456789";

const repository = {
  id: "repo-123",
  projectId: "project-123",
  url: "https://github.com/acme/forgemind.git",
  defaultBranch: "main",
};

const operationResult = {
  repositoryId: repository.id,
  workspacePath: "/tmp/forgemind-test",
  remoteUrl: repository.url,
  branch: "main",
  headCommit: "a".repeat(40),
  completedAt: "2026-10-11T00:00:00.000Z",
};

async function withServer(
  handler: express.Express,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = handler.listen(0);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function createGitOperationsMocks() {
  return {
    cloneRepository: vi.fn<GitOperations["cloneRepository"]>(),
    synchronizeRepository: vi.fn<GitOperations["synchronizeRepository"]>(),
  };
}

function createRepositoryAccessClientMock() {
  return {
    getAuthorizedRepository:
      vi.fn<RepositoryAccessClient["getAuthorizedRepository"]>(),
  };
}

function createTestApp(
  gitOperations: ReturnType<typeof createGitOperationsMocks>,
  repositoryAccessClient: ReturnType<typeof createRepositoryAccessClientMock>,
): express.Express {
  const app = express();
  app.use(express.json());

  app.use(
    "/api/git",
    createGitRouter({
      gitOperations,
      repositoryAccessClient,
    }),
  );

  app.use(errorHandler);
  return app;
}

function createToken(): string {
  return jwt.sign(
    { userId: "user-123", workspaceId: "workspace-123" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

describe("Git controller", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", JWT_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated clone requests before accessing the repository", async () => {
    const gitOperations = createGitOperationsMocks();
    const repositoryAccessClient = createRepositoryAccessClientMock();

    const app = createTestApp(gitOperations, repositoryAccessClient);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/git/repositories/${repository.id}/clone`,
        { method: "POST" },
      );

      expect(response.status).toBe(401);
      expect(repositoryAccessClient.getAuthorizedRepository).not.toHaveBeenCalled();
      expect(gitOperations.cloneRepository).not.toHaveBeenCalled();
    });
  });

  it("does not clone a repository the caller cannot access", async () => {
    const gitOperations = createGitOperationsMocks();
    const repositoryAccessClient = createRepositoryAccessClientMock();
    repositoryAccessClient.getAuthorizedRepository
      .mockRejectedValue(new NotFoundError("Repository not found"));

    const app = createTestApp(gitOperations, repositoryAccessClient);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/git/repositories/${repository.id}/clone`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${createToken()}` },
        },
      );

      expect(response.status).toBe(404);
      expect(gitOperations.cloneRepository).not.toHaveBeenCalled();
    });
  });

  it("does not clone when Repository Service is unavailable", async () => {
    const gitOperations = createGitOperationsMocks();
    const repositoryAccessClient = createRepositoryAccessClientMock();
    repositoryAccessClient.getAuthorizedRepository
      .mockRejectedValue(new ServiceUnavailableError());

    const app = createTestApp(gitOperations, repositoryAccessClient);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/git/repositories/${repository.id}/clone`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${createToken()}` },
        },
      );

      expect(response.status).toBe(503);
      expect(gitOperations.cloneRepository).not.toHaveBeenCalled();
    });
  });

  it("uses the authorized repository URL instead of a caller-supplied URL", async () => {
    const gitOperations = createGitOperationsMocks();
    gitOperations.cloneRepository.mockResolvedValue(operationResult);
    const repositoryAccessClient = createRepositoryAccessClientMock();
    repositoryAccessClient.getAuthorizedRepository.mockResolvedValue(repository);

    const app = createTestApp(gitOperations, repositoryAccessClient);

    await withServer(app, async (baseUrl) => {
      const token = createToken();

      const response = await fetch(
        `${baseUrl}/api/git/repositories/${repository.id}/clone`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            remoteUrl: "https://github.com/attacker/malicious.git",
          }),
        },
      );

      expect(response.status).toBe(201);
      expect(repositoryAccessClient.getAuthorizedRepository).toHaveBeenCalledWith(
        repository.id,
        `Bearer ${token}`,
      );
      expect(gitOperations.cloneRepository).toHaveBeenCalledWith(
        repository.id,
        repository.url,
      );

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.remoteUrl).toBe(repository.url);
    });
  });

  it("synchronizes only after repository authorization succeeds", async () => {
    const gitOperations = createGitOperationsMocks();
    gitOperations.synchronizeRepository.mockResolvedValue(operationResult);
    const repositoryAccessClient = createRepositoryAccessClientMock();
    repositoryAccessClient.getAuthorizedRepository.mockResolvedValue(repository);

    const app = createTestApp(gitOperations, repositoryAccessClient);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/git/repositories/${repository.id}/synchronize`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${createToken()}` },
        },
      );

      expect(response.status).toBe(200);
      expect(gitOperations.synchronizeRepository).toHaveBeenCalledWith(
        repository.id,
        repository.url,
      );
      expect(gitOperations.cloneRepository).not.toHaveBeenCalled();
    });
  });
});
