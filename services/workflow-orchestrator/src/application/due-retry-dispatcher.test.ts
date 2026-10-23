import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { Workflow } from "../domain/workflow.js";

vi.mock("../infrastructure/database/prisma.js", () => ({
  prisma: {},
}));

import { DueRetryDispatcher } from "./due-retry-dispatcher.js";

const now = new Date("2026-10-23T12:01:00.000Z");
const dueAt = new Date("2026-10-23T12:00:30.000Z");

function createRetryWorkflow(stage: "sync" | "parse" = "sync") {
  const workflow = Workflow.create(
    {
      repositoryId: "repository-id",
      projectId: "project-id",
      ownerId: "owner-id",
      correlationId: "correlation-id",
      traceId: "trace-id",
      createdAt: new Date("2026-10-23T11:00:00.000Z"),
    },
    "workflow-id",
  );
  workflow.start(new Date("2026-10-23T11:00:00.000Z"));

  if (stage === "parse") {
    workflow.synchronize("a".repeat(40), new Date("2026-10-23T11:01:00.000Z"));
  }

  workflow.recordFailure(
    {
      code: "TRANSIENT_FAILURE",
      message: "Temporary failure",
      retryable: true,
      occurredAt: new Date("2026-10-23T12:00:00.000Z"),
    },
    dueAt,
  );
  return workflow.getSnapshot();
}

function persistedRecord(snapshot: ReturnType<typeof createRetryWorkflow>) {
  return {
    ...snapshot,
    lastFailureCode: snapshot.lastFailure?.code ?? null,
    lastFailureMessage: snapshot.lastFailure?.message ?? null,
    lastFailureRetryable: snapshot.lastFailure?.retryable ?? null,
    lastFailureAt: snapshot.lastFailure?.occurredAt ?? null,
    lastFailure: undefined,
    version: 4,
  };
}

function createHarness(
  initialRecord: ReturnType<typeof persistedRecord>,
  options: { updateCount?: number; outboxCreateError?: Error } = {},
) {
  let record = { ...initialRecord };
  const outboxRows: Array<Record<string, unknown>> = [];
  const updateMany = vi.fn(async (args: {
    where: { id: string; version: number };
    data: Record<string, unknown>;
  }) => {
    if (options.updateCount === 0 || record.version !== args.where.version) {
      return { count: 0 };
    }
    const versionUpdate = args.data.version as { increment: number };
    record = {
      ...record,
      ...args.data,
      version: record.version + versionUpdate.increment,
    };
    return { count: 1 };
  });
  const findUnique = vi.fn(async () => ({ ...record }));
  const findMany = vi.fn(async () => [{ id: initialRecord.id }]);
  const createOutbox = vi.fn(async (args: { data: Record<string, unknown> }) => {
    if (options.outboxCreateError) throw options.outboxCreateError;
    outboxRows.push(args.data);
    return args.data;
  });
  const tx = {
    workflowExecution: { findUnique, updateMany },
    workflowOutboxEvent: { create: createOutbox },
  };
  const client = {
    workflowExecution: { findMany },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const originalRecord = { ...record };
      const originalOutboxLength = outboxRows.length;
      try {
        return await callback(tx);
      } catch (error) {
        record = originalRecord;
        outboxRows.splice(originalOutboxLength);
        throw error;
      }
    }),
  } as unknown as PrismaClient;

  return {
    client,
    findMany,
    updateMany,
    createOutbox,
    outboxRows,
    getRecord: () => record,
  };
}

describe("DueRetryDispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resumes a due sync retry and atomically writes a sync request to the outbox", async () => {
    const harness = createHarness(persistedRecord(createRetryWorkflow()));
    const dispatcher = new DueRetryDispatcher(harness.client, { now: () => now });

    await expect(dispatcher.dispatchDueRetries()).resolves.toEqual({
      scanned: 1,
      dispatched: 1,
      skipped: 0,
      invalid: 0,
    });

    expect(harness.getRecord()).toMatchObject({
      status: "RUNNING",
      stageAttempt: 1,
      nextAttemptAt: null,
      version: 5,
    });
    expect(harness.outboxRows).toHaveLength(1);
    expect(harness.outboxRows[0]).toMatchObject({
      eventType: "RepositorySyncRequested",
      payload: expect.objectContaining({
        eventType: "RepositorySyncRequested",
        correlationId: "correlation-id",
        data: {
          repositoryId: "repository-id",
          projectId: "project-id",
          ownerId: "owner-id",
          defaultBranch: null,
          requestedAt: now.toISOString(),
        },
      }),
    });
  });

  it("retries parsing at the existing commit instead of restarting synchronization", async () => {
    const harness = createHarness(persistedRecord(createRetryWorkflow("parse")));
    const dispatcher = new DueRetryDispatcher(harness.client, { now: () => now });

    const result = await dispatcher.dispatchDueRetries();

    expect(result.dispatched).toBe(1);
    expect(harness.outboxRows[0]).toMatchObject({
      eventType: "RepositoryParseRequested",
      payload: expect.objectContaining({
        eventType: "RepositoryParseRequested",
        data: {
          repositoryId: "repository-id",
          projectId: "project-id",
          ownerId: "owner-id",
          headCommit: "a".repeat(40),
          requestedAt: now.toISOString(),
        },
      }),
    });
  });

  it("fails a due retry whose stage has no event dispatcher instead of retrying forever", async () => {
    const snapshot = createRetryWorkflow();
    const record = persistedRecord({
      ...snapshot,
      currentStage: "SEMANTIC_ANALYSIS",
    });
    const harness = createHarness(record);
    const dispatcher = new DueRetryDispatcher(harness.client, { now: () => now });

    await expect(dispatcher.dispatchDueRetries()).resolves.toMatchObject({
      dispatched: 0,
      skipped: 0,
      invalid: 1,
    });
    expect(harness.getRecord()).toMatchObject({
      status: "FAILED",
      nextAttemptAt: null,
      lastFailureCode: "UNSUPPORTED_RETRY_STAGE",
      lastFailureRetryable: false,
    });
    expect(harness.outboxRows).toHaveLength(0);
  });

  it("fails a parse retry with no commit instead of retrying forever", async () => {
    const snapshot = createRetryWorkflow("parse");
    const record = persistedRecord({ ...snapshot, headCommit: null });
    const harness = createHarness(record);
    const dispatcher = new DueRetryDispatcher(harness.client, { now: () => now });

    await expect(dispatcher.dispatchDueRetries()).resolves.toMatchObject({
      dispatched: 0,
      skipped: 0,
      invalid: 1,
    });
    expect(harness.getRecord()).toMatchObject({
      status: "FAILED",
      nextAttemptAt: null,
      lastFailureCode: "UNSUPPORTED_RETRY_STAGE",
      lastFailureRetryable: false,
    });
    expect(harness.outboxRows).toHaveLength(0);
  });

  it("skips a retry that is no longer due", async () => {
    const snapshot = createRetryWorkflow();
    const future = new Date(now.getTime() + 60_000);
    const record = persistedRecord({ ...snapshot, nextAttemptAt: future });
    const harness = createHarness(record);
    const dispatcher = new DueRetryDispatcher(harness.client, { now: () => now });

    await expect(dispatcher.dispatchDueRetries()).resolves.toMatchObject({
      dispatched: 0,
      skipped: 1,
    });
    expect(harness.updateMany).not.toHaveBeenCalled();
    expect(harness.outboxRows).toHaveLength(0);
  });

  it("skips a retry when another worker already claimed the workflow", async () => {
    const harness = createHarness(persistedRecord(createRetryWorkflow()), {
      updateCount: 0,
    });
    const dispatcher = new DueRetryDispatcher(harness.client, { now: () => now });

    await expect(dispatcher.dispatchDueRetries()).resolves.toMatchObject({
      dispatched: 0,
      skipped: 1,
    });
    expect(harness.outboxRows).toHaveLength(0);
  });

  it("rolls back the workflow transition if outbox insertion fails", async () => {
    const harness = createHarness(persistedRecord(createRetryWorkflow()), {
      outboxCreateError: new Error("database unavailable"),
    });
    const dispatcher = new DueRetryDispatcher(harness.client, { now: () => now });

    await expect(dispatcher.dispatchDueRetries()).rejects.toThrow(
      "database unavailable",
    );
    expect(harness.getRecord()).toMatchObject({
      status: "RETRY_WAIT",
      stageAttempt: 0,
      nextAttemptAt: dueAt,
      version: 4,
    });
    expect(harness.outboxRows).toHaveLength(0);
  });

  it("rejects an invalid batch size", () => {
    expect(() => new DueRetryDispatcher({} as PrismaClient, { batchSize: 0 }))
      .toThrow("batchSize must be a positive integer.");
  });

  it("uses optimistic concurrency to prevent duplicate dispatch", async () => {
    const harness = createHarness(persistedRecord(createRetryWorkflow()), {
      updateCount: 0,
    });
    const dispatcher = new DueRetryDispatcher(harness.client, { now: () => now });

    const result = await dispatcher.dispatchDueRetries();

    expect(result.skipped).toBe(1);
    expect(result.dispatched).toBe(0);
    expect(harness.createOutbox).not.toHaveBeenCalled();
  });
});
