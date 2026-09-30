import type { Project } from "../generated/prisma/index.js";
import { prisma } from "../infrastructure/database/prisma.js";

export interface CreateProjectRepositoryInput {
  name: string;
  description?: string | null;
  ownerId: string;
}

export interface UpdateProjectRepositoryInput {
  name?: string;
  description?: string | null;
}

export class ProjectRepository {
  async create(input: CreateProjectRepositoryInput): Promise<Project> {
    return prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          name: input.name,
          description: input.description,
          ownerId: input.ownerId,
        },
      });

      await transaction.projectMembership.create({
        data: {
          projectId: project.id,
          userId: input.ownerId,
          role: "OWNER",
        },
      });

      return project;
    });
  }

  async findById(id: string): Promise<Project | null> {
    return prisma.project.findUnique({
      where: { id },
    });
  }

  async update(
    id: string,
    input: UpdateProjectRepositoryInput,
  ): Promise<Project> {
    return prisma.project.update({
      where: { id },
      data: input,
    });
  }

  async delete(id: string): Promise<Project> {
    return prisma.project.delete({
      where: { id },
    });
  }

  async findByOwnerId(
    ownerId: string,
    page: number,
    pageSize: number,
  ): Promise<{ projects: Project[]; total: number }> {
    const skip = (page - 1) * pageSize;

    const [projects, total] = await prisma.$transaction([
      prisma.project.findMany({
        where: { ownerId },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: pageSize,
      }),
      prisma.project.count({
        where: { ownerId },
      }),
    ]);

    return {
      projects,
      total,
    };
  }
}
