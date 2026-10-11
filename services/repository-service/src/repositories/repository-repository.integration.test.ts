import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../infrastructure/database/prisma.js";
import { RepositoryRepository } from "./repository-repository.js";

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";

const context = {
  ownerId: randomUUID(),
  correlationId: randomUUID(),
  traceId: randomUUID(),
};

function createInput(name: string) {
  return {
    projectId: randomUUID(),
    name,
    provider: "GITHUB" as const,
    defaultBranch: "main",
    url: `https://github.com/forgemind-integration/${name}`,
  };
}

describe.skipIf(!enabled)("RepositoryRepository PostgreSQL integration", () => {
  it("persists a repository and its imported event", async () => {
    const input = createInput(`integration-${randomUUID()}`);
    let repositoryId: string | undefined;

    try {
      const repository = await new RepositoryRepository().create(
        input,
        context,
      );

      repositoryId = repository.id;

      expect(repository.name).toBe(input.name);

      const rows = await prisma.$queryRaw<
        Array<{ eventId: string; eventType: string; payload: unknown }>
      >`
        SELECT "eventId", "eventType", "payload"
        FROM "repository"."event_outbox"
        WHERE "payload"->'data'->>'repositoryId' = ${repository.id}
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.eventType).toBe("RepositoryImported");
      expect(rows[0]?.payload).toMatchObject({
        eventType: "RepositoryImported",
        correlationId: context.correlationId,
        traceId: context.traceId,
        data: {
          repositoryId: repository.id,
          projectId: input.projectId,
          ownerId: context.ownerId,
          name: input.name,
        },
      });
    } finally {
      if (repositoryId) {
        await prisma.$executeRaw`
          DELETE FROM "repository"."event_outbox"
          WHERE "payload"->'data'->>'repositoryId' = ${repositoryId}
        `;

        await prisma.repository.deleteMany({
          where: { id: repositoryId },
        });
      }
    }
  });

  it("rolls back repository creation when the outbox insert fails", async () => {
    const duplicateEventId = randomUUID();
    const input = createInput(`rollback-${randomUUID()}`);

    await prisma.eventOutbox.create({
      data: {
        eventId: duplicateEventId,
        eventType: "IntegrationTestSeed",
        payload: { testSeed: true },
      },
    });

    try {
      const repositoryRepository = new RepositoryRepository(
        () => duplicateEventId,
      );

      await expect(
        repositoryRepository.create(input, context),
      ).rejects.toThrow();

      const repositoryCount = await prisma.repository.count({
        where: { name: input.name },
      });

      expect(repositoryCount).toBe(0);
    } finally {
      await prisma.repository.deleteMany({
        where: { name: input.name },
      });

      await prisma.eventOutbox.deleteMany({
        where: { eventId: duplicateEventId },
      });
    }
  });
});

afterAll(async () => {
  // The shared Prisma client is managed by the service/test process.
});
