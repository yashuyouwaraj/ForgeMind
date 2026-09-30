import {
  ConflictError,
  NotFoundError,
} from "@forgemind/shared-errors";
import type {
  AddProjectMemberInput,
  ProjectMembership,
  UpdateProjectMemberRoleInput,
} from "../domain/membership/membership-types.js";
import { ProjectMembershipRepository } from "../repositories/project-membership-repository.js";
import { ProjectRepository } from "../repositories/project-repository.js";

export class ProjectMembershipService {
  constructor(
    private readonly projectMembershipRepository: ProjectMembershipRepository,
    private readonly projectRepository: ProjectRepository,
  ) {}

  async addMember(
    requesterId: string,
    input: AddProjectMemberInput,
  ): Promise<ProjectMembership> {
    const project = await this.projectRepository.findById(input.projectId);

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (project.ownerId !== requesterId) {
      throw new NotFoundError("Project not found");
    }

    const existingMembership =
      await this.projectMembershipRepository.findByProjectAndUser(
        input.projectId,
        input.userId,
      );

    if (existingMembership) {
      throw new ConflictError("User is already a project member");
    }

    if (input.role === "OWNER") {
      throw new ConflictError(
        "A project can only have one owner",
      );
    }

    return this.projectMembershipRepository.create({
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
    }) as Promise<ProjectMembership>;
  }

  async listMembers(
    requesterId: string,
    projectId: string,
  ): Promise<ProjectMembership[]> {
    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const requesterMembership =
      await this.projectMembershipRepository.findByProjectAndUser(
        projectId,
        requesterId,
      );

    if (!requesterMembership) {
      throw new NotFoundError("Project not found");
    }

    return this.projectMembershipRepository.findByProjectId(projectId) as Promise<
      ProjectMembership[]
    >;
  }

  async updateMemberRole(
    requesterId: string,
    projectId: string,
    userId: string,
    input: UpdateProjectMemberRoleInput,
  ): Promise<ProjectMembership> {
    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (project.ownerId !== requesterId) {
      throw new NotFoundError("Project not found");
    }

    const membership =
      await this.projectMembershipRepository.findByProjectAndUser(
        projectId,
        userId,
      );

    if (!membership) {
      throw new NotFoundError("Project member not found");
    }

    if (membership.role === "OWNER") {
      throw new ConflictError(
        "The project owner role cannot be changed",
      );
    }

    if (input.role === "OWNER") {
      throw new ConflictError(
        "A project can only have one owner",
      );
    }

    return this.projectMembershipRepository.updateRole(
      projectId,
      userId,
      input,
    ) as Promise<ProjectMembership>;
  }

  async removeMember(
    requesterId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (project.ownerId !== requesterId) {
      throw new NotFoundError("Project not found");
    }

    const membership =
      await this.projectMembershipRepository.findByProjectAndUser(
        projectId,
        userId,
      );

    if (!membership) {
      throw new NotFoundError("Project member not found");
    }

    if (membership.role === "OWNER") {
      throw new ConflictError(
        "The project owner cannot be removed",
      );
    }

    await this.projectMembershipRepository.delete(
      projectId,
      userId,
    );
  }
}