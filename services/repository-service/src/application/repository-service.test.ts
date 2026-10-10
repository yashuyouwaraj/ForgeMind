
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@forgemind/shared-errors";
import type { RepositoryRepository } from "../repositories/repository-repository.js";
import { RepositoryService } from "./repository-service.js";

const repository = {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  name: "forgemind-core",
  provider: "GITHUB" as const,
  defaultBranch: "main",
  url: "https://github.com/example/forgemind-core",
  status: "Registered",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("RepositoryService", () => {
  const repositoryRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findByProjectId: vi.fn(),
  };

  const service = new RepositoryService(
    repositoryRepository as unknown as RepositoryRepository,
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers a repository through the repository", async () => {
    const input = {
      projectId: repository.projectId,
      name: repository.name,
      provider: repository.provider,
      defaultBranch: "main",
      url: repository.url,
    };

    repositoryRepository.create.mockResolvedValue(repository);

    await expect(service.registerRepository(input)).resolves.toEqual(
      repository,
    );

    expect(repositoryRepository.create).toHaveBeenCalledWith(input);
  });

  it("returns a repository by ID", async () => {
    repositoryRepository.findById.mockResolvedValue(repository);

    await expect(
      service.getRepository(repository.id),
    ).resolves.toEqual(repository);

    expect(repositoryRepository.findById).toHaveBeenCalledWith(
      repository.id,
    );
  });

  it("throws NotFoundError when a repository does not exist", async () => {
    repositoryRepository.findById.mockResolvedValue(null);

    await expect(
      service.getRepository(repository.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists repositories with pagination", async () => {
    const result = {
      repositories: [repository],
      total: 1,
    };

    repositoryRepository.findByProjectId.mockResolvedValue(result);

    await expect(
      service.listRepositories(repository.projectId, {
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual(result);

    expect(
      repositoryRepository.findByProjectId,
    ).toHaveBeenCalledWith(repository.projectId, 1, 20);
  });
});
