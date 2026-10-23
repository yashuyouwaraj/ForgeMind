
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { RepositoryEventProcessor } from "./repository-event-processor.js";

vi.mock("../infrastructure/database/prisma.js", () => ({
  prisma: {},
}));

describe("RepositoryEventProcessor retry scheduling", () => {
  it("schedules retries from processing time for delayed events", async () => {
    const now = new Date("2026-10-23T12:00:00.000Z");
    const occurredAt = "2026-10-20T12:00:00.000Z";

    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      repositoryId: "00000000-0000-4000-8000-000000000002",
      projectId: "00000000-0000-4000-8000-000000000003",
      ownerId: "00000000-0000-4000-8000-000000000004",
      headCommit: null,
      correlationId: "correlation-1",
      traceId: "trace-1",
      status: "RUNNING",
      currentStage: "REPOSITORY_SYNC",
      stageAttempt: 0,
      createdAt: new Date("2026-10-20T11:59:00.000Z"),
      updatedAt: new Date("2026-10-20T11:59:00.000Z"),
      startedAt: new Date("2026-10-20T11:59:00.000Z"),
      completedAt: null,
      nextAttemptAt: null,
      lastFailureCode: null,
      lastFailureMessage: null,
      lastFailureRetryable: null,
      lastFailureAt: null,
      version: 0,
    });

    const tx = {
      workflowInboxEvent: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      workflowExecution: {
        findFirst: vi.fn().mockResolvedValue({
          id: "00000000-0000-4000-8000-000000000001",
        }),
        findUnique,
        updateMany,
      },
      workflowOutboxEvent: {
        create: vi.fn(),
      },
    };

    const client = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const processor = new RepositoryEventProcessor(
      client as unknown as PrismaClient,
      {
        now: () => now,
        retryDelayMs: 30_000,
      },
    );

    const event = {
      eventId: "event-failure-1",
      eventType: "RepositorySyncFailed",
      eventVersion: 1,
      occurredAt,
      correlationId: "correlation-1",
      traceId: "trace-1",
      data: {
        repositoryId: "00000000-0000-4000-8000-000000000002",
        projectId: "00000000-0000-4000-8000-000000000003",
        ownerId: "00000000-0000-4000-8000-000000000004",
        failureCode: "REPOSITORY_SYNC_TEMPORARY_FAILURE",
        retryable: true,
      },
    } as const;

    await processor.process(event);

    const savedData = updateMany.mock.calls[0]?.[0]?.data as
      | { nextAttemptAt?: Date }
      | undefined;

    expect(savedData?.nextAttemptAt).toEqual(
      new Date("2026-10-23T12:00:30.000Z"),
    );
  });
});
