
import type {
  Repository as PrismaRepository,
  RepositoryProvider as PrismaRepositoryProvider,
} from "../generated/prisma/index.js";
import { prisma } from "../infrastructure/database/prisma.js";
import type {
  RegisterRepositoryInput,
} from "../domain/repository/repository-types.js";

export interface ListRepositoriesResult {
  repositories: PrismaRepository[];
  total: number;
}

export class RepositoryRepository {
  async create(
    input: RegisterRepositoryInput,
  ): Promise<PrismaRepository> {
    return prisma.repository.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        provider: input.provider as PrismaRepositoryProvider,
        defaultBranch: input.defaultBranch,
        url: input.url,
      },
    });
  }

  async findById(id: string): Promise<PrismaRepository | null> {
    return prisma.repository.findUnique({
      where: { id },
    });
  }

  async findByProjectId(
    projectId: string,
    page: number,
    pageSize: number,
  ): Promise<ListRepositoriesResult> {
    const skip = (page - 1) * pageSize;

    const [repositories, total] = await prisma.$transaction([
      prisma.repository.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.repository.count({
        where: { projectId },
      }),
    ]);

    return { repositories, total };
  }
}
