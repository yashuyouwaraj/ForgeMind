import type { ProjectRole } from "../domain/membership/membership-types.js";
import { prisma } from "../infrastructure/database/prisma.js";

export interface CreateProjectMembershipRepositoryInput {
  projectId: string;
  userId: string;
  role: ProjectRole;
}

export interface UpdateProjectMembershipRepositoryInput {
  role: ProjectRole;
}

export class ProjectMembershipRepository {
  async create(
    input: CreateProjectMembershipRepositoryInput,
  ) {
    return prisma.projectMembership.create({
      data: {
        projectId: input.projectId,
        userId: input.userId,
        role: input.role,
      },
    });
  }

  async findByProjectAndUser(
    projectId: string,
    userId: string,
  ) {
    return prisma.projectMembership.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  }

  async findByProjectId(projectId: string) {
    return prisma.projectMembership.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  async updateRole(
    projectId: string,
    userId: string,
    input: UpdateProjectMembershipRepositoryInput,
  ) {
    return prisma.projectMembership.update({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      data: {
        role: input.role,
      },
    });
  }

  async delete(projectId: string, userId: string) {
    return prisma.projectMembership.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  }
}