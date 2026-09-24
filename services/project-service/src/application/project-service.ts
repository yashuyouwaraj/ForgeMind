import {
  NotFoundError,
} from "@forgemind/shared-errors";
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "../domain/project/project-types.js";
import {
  ProjectRepository,
} from "../repositories/project-repository.js";

export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
  ) {}

  async createProject(
    ownerId: string,
    input: CreateProjectInput,
  ): Promise<Project> {
    return this.projectRepository.create({
      name: input.name,
      description: input.description,
      ownerId,
    });
  }

  async listProjects(ownerId: string): Promise<Project[]> {
    return this.projectRepository.findByOwnerId(ownerId);
  }

  async getProject(
    projectId: string,
    ownerId: string,
  ): Promise<Project> {
    const project = await this.projectRepository.findById(projectId);

    if (!project || project.ownerId !== ownerId) {
      throw new NotFoundError("Project not found");
    }

    return project;
  }

  async updateProject(
    projectId: string,
    ownerId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    await this.getProject(projectId, ownerId);

    return this.projectRepository.update(projectId, {
      name: input.name,
      description: input.description,
    });
  }

  async deleteProject(
    projectId: string,
    ownerId: string,
  ): Promise<void> {
    await this.getProject(projectId, ownerId);
    await this.projectRepository.delete(projectId);
  }
}