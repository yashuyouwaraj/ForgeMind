import type { Project } from "@prisma/client";
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
  async create(
    input: CreateProjectRepositoryInput,
  ): Promise<Project> {
    return prisma.project.create({
      data: {
        name: input.name,
        description: input.description,
        ownerId: input.ownerId,
      },
    });
  }

  async findById(id: string): Promise<Project | null> {
    return prisma.project.findUnique({
      where: { id },
    });
  }

  async findByOwnerId(ownerId: string): Promise<Project[]> {
    return prisma.project.findMany({
      where: { ownerId },
      orderBy: {
        createdAt: "desc",
      },
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
}