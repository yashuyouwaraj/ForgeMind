
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@forgemind/shared-errors";
import type { RepositoryService } from "../../application/repository-service.js";
import { JwtService } from "../../infrastructure/security/jwt-service.js";
import type { ProjectAccessClient } from "../../infrastructure/security/project-access-client.js";
import { createRepositoryApp } from "../../app.js";

const jwtSecret = "test-secret-that-is-at-least-32-characters-long";

const userId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "44444444-4444-4444-8444-444444444444";
const projectId = "22222222-2222-4222-8222-222222222222";
const repositoryId = "11111111-1111-4111-8111-111111111111";

const authorization = `Bearer ${jwt.sign(
  { userId, workspaceId },
  jwtSecret,
  { expiresIn: "1h" },
)}`;

const repository = {
  id: repositoryId,
  projectId,
  name: "forgemind-core",
  provider: "GITHUB" as const,
  defaultBranch: "main",
  url: "https://github.com/example/forgemind-core",
  status: "Registered",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("Repository routes", () => {
  const repositoryServiceMock = {
    registerRepository: vi.fn(),
    getRepository: vi.fn(),
    listRepositories: vi.fn(),
  };

  const projectAccessClientMock = {
    assertProjectOwner: vi.fn(),
  };

  function createTestApp() {
    return createRepositoryApp({
      repositoryService:
        repositoryServiceMock as unknown as RepositoryService,
      jwtService: new JwtService(jwtSecret),
      projectAccessClient:
        projectAccessClientMock as unknown as ProjectAccessClient,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();

    repositoryServiceMock.registerRepository.mockResolvedValue(repository);
    repositoryServiceMock.getRepository.mockResolvedValue(repository);
    repositoryServiceMock.listRepositories.mockResolvedValue({
      repositories: [repository],
      total: 1,
    });
    projectAccessClientMock.assertProjectOwner.mockResolvedValue(undefined);
  });

  it("rejects requests without authentication", async () => {
    const response = await request(createTestApp())
      .get("/api/repositories")
      .query({ projectId });

    expect(response.status).toBe(401);
    expect(repositoryServiceMock.listRepositories).not.toHaveBeenCalled();
  });

  it("registers a repository after project ownership is verified", async () => {
    const input = {
      projectId,
      name: repository.name,
      provider: repository.provider,
      defaultBranch: repository.defaultBranch,
      url: repository.url,
    };

    const response = await request(createTestApp())
      .post("/api/repositories")
      .set("Authorization", authorization)
      .send(input);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(repositoryId);

    expect(
      projectAccessClientMock.assertProjectOwner,
    ).toHaveBeenCalledWith(projectId, authorization);

    expect(
      repositoryServiceMock.registerRepository,
    ).toHaveBeenCalledWith(input);
  });

  it("does not register a repository when project access is denied", async () => {
    projectAccessClientMock.assertProjectOwner.mockRejectedValue(
      new NotFoundError("Project not found"),
    );

    const response = await request(createTestApp())
      .post("/api/repositories")
      .set("Authorization", authorization)
      .send({
        projectId,
        name: repository.name,
        provider: repository.provider,
        url: repository.url,
      });

    expect(response.status).toBe(404);
    expect(repositoryServiceMock.registerRepository).not.toHaveBeenCalled();
  });

  it("lists repositories only after project ownership is verified", async () => {
    const response = await request(createTestApp())
      .get("/api/repositories")
      .set("Authorization", authorization)
      .query({ projectId, page: 1, pageSize: 20 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination.totalRecords).toBe(1);

    expect(
      projectAccessClientMock.assertProjectOwner,
    ).toHaveBeenCalledWith(projectId, authorization);

    expect(
      repositoryServiceMock.listRepositories,
    ).toHaveBeenCalledWith(projectId, { page: 1, pageSize: 20 });
  });

  it("verifies ownership before returning a repository", async () => {
    const response = await request(createTestApp())
      .get(`/api/repositories/${repositoryId}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(repositoryId);

    expect(
      projectAccessClientMock.assertProjectOwner,
    ).toHaveBeenCalledWith(projectId, authorization);
  });

  it("does not return a repository when project access is denied", async () => {
    projectAccessClientMock.assertProjectOwner.mockRejectedValue(
      new NotFoundError("Project not found"),
    );

    const response = await request(createTestApp())
      .get(`/api/repositories/${repositoryId}`)
      .set("Authorization", authorization);

    expect(response.status).toBe(404);
  });
});
