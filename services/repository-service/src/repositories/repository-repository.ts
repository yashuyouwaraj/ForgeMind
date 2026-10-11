import { randomUUID } from "node:crypto";
import type {
  Prisma,
  Repository as PrismaRepository,
  RepositoryProvider as PrismaRepositoryProvider,
} from "../generated/prisma/index.js";
import type { RepositoryImportedEvent } from "@forgemind/shared-events";
import { prisma } from "../infrastructure/database/prisma.js";
import type { RegisterRepositoryInput } from "../domain/repository/repository-types.js";

export interface ListRepositoriesResult {
  repositories: PrismaRepository[];
  total: number;
}

export interface RepositoryEventContext {
  ownerId: string;
  correlationId: string;
  traceId: string;
}

export class RepositoryRepository {
  constructor(private readonly createEventId: () => string = randomUUID) {}

  async create(
    input: RegisterRepositoryInput,
    context: RepositoryEventContext,
  ): Promise<PrismaRepository> {
    return prisma.$transaction(async (tx) => {
      const repository = await tx.repository.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          provider: input.provider as PrismaRepositoryProvider,
          defaultBranch: input.defaultBranch,
          url: input.url,
        },
      });

      const occurredAt = new Date().toISOString();

      const event: RepositoryImportedEvent = {
        eventId: this.createEventId(),
        eventType: "RepositoryImported",
        eventVersion: 1,
        occurredAt,
        correlationId: context.correlationId,
        traceId: context.traceId,
        data: {
          repositoryId: repository.id,
          projectId: repository.projectId,
          ownerId: context.ownerId,
          name: repository.name,
          provider: repository.provider,
          url: repository.url,
          defaultBranch: repository.defaultBranch,
        },
      };

      await tx.eventOutbox.create({
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          payload: event as unknown as Prisma.InputJsonValue,
          occurredAt: new Date(event.occurredAt),
        },
      });

      return repository;
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
