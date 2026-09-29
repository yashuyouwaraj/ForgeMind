import { describe, expect, it, vi } from "vitest";
import { ProjectService } from "./project-service.js";
import type { Project } from "../domain/project/project-types.js";
import type { ProjectRepository } from "../repositories/project-repository.js";

const project: Project = {
  id: "project-1",
  name: "ForgeMind",
  description: "Software Intelligence Platform",
  ownerId: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createRepositoryMock() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByOwnerId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as ProjectRepository;
}

describe("ProjectService authorization", () => {
  it("allows the project owner to access the project", async () => {
    const repository = createRepositoryMock();

    vi.mocked(repository.findById).mockResolvedValue(project);

    const service = new ProjectService(repository);

    const result = await service.getProject("project-1", "user-1");

    expect(result).toEqual(project);
    expect(repository.findById).toHaveBeenCalledWith("project-1");
  });

  it("rejects access when the authenticated user is not the owner", async () => {
    const repository = createRepositoryMock();

    vi.mocked(repository.findById).mockResolvedValue(project);

    const service = new ProjectService(repository);

    await expect(service.getProject("project-1", "user-2")).rejects.toThrow(
      "Project not found",
    );

    expect(repository.findById).toHaveBeenCalledWith("project-1");
  });

  it("returns not found when the project does not exist", async () => {
    const repository = createRepositoryMock();

    vi.mocked(repository.findById).mockResolvedValue(null);

    const service = new ProjectService(repository);

    await expect(
      service.getProject("missing-project", "user-1"),
    ).rejects.toThrow("Project not found");
  });

  it("prevents a non-owner from updating a project", async () => {
    const repository = createRepositoryMock();

    vi.mocked(repository.findById).mockResolvedValue(project);

    const service = new ProjectService(repository);

    await expect(
      service.updateProject("project-1", "user-2", {
        name: "Unauthorized Update",
      }),
    ).rejects.toThrow("Project not found");

    expect(repository.update).not.toHaveBeenCalled();
  });

  it("prevents a non-owner from deleting a project", async () => {
    const repository = createRepositoryMock();

    vi.mocked(repository.findById).mockResolvedValue(project);

    const service = new ProjectService(repository);

    await expect(service.deleteProject("project-1", "user-2")).rejects.toThrow(
      "Project not found",
    );

    expect(repository.delete).not.toHaveBeenCalled();
  });

  it("allows the owner to update the project", async () => {
    const repository = createRepositoryMock();

    vi.mocked(repository.findById).mockResolvedValue(project);

    const updatedProject: Project = {
      ...project,
      name: "Updated ForgeMind",
    };

    vi.mocked(repository.update).mockResolvedValue(updatedProject);

    const service = new ProjectService(repository);

    const result = await service.updateProject("project-1", "user-1", {
      name: "Updated ForgeMind",
    });

    expect(result).toEqual(updatedProject);

    expect(repository.update).toHaveBeenCalledWith("project-1", {
      name: "Updated ForgeMind",
      description: undefined,
    });
  });

  it("allows the owner to delete the project", async () => {
    const repository = createRepositoryMock();

    vi.mocked(repository.findById).mockResolvedValue(project);
    vi.mocked(repository.delete).mockResolvedValue(project);

    const service = new ProjectService(repository);

    await expect(
      service.deleteProject("project-1", "user-1"),
    ).resolves.toBeUndefined();

    expect(repository.delete).toHaveBeenCalledWith("project-1");
  });
});
