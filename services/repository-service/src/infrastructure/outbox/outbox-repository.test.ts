
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("../database/prisma.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
    eventOutbox: {
      updateMany: mocks.updateMany,
      findFirst: mocks.findFirst,
    },
  },
}));

import { OutboxRepository } from "./outbox-repository.js";

describe("OutboxRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      (callback) => callback({ $queryRaw: mocks.queryRaw }),
    );
    mocks.queryRaw.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findFirst.mockResolvedValue({ attempts: 1 });
  });

  it("rejects invalid lease settings", () => {
    expect(() => new OutboxRepository({ leaseDurationMs: 500 }))
      .toThrow("INVALID_OUTBOX_LEASE_DURATION");

    expect(() => new OutboxRepository({ maxAttempts: 0 }))
      .toThrow("INVALID_OUTBOX_MAX_ATTEMPTS");
  });

  it("rejects invalid batch sizes", async () => {
    const repository = new OutboxRepository();

    await expect(repository.claimBatch(0))
      .rejects.toThrow("INVALID_OUTBOX_BATCH_SIZE");

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("claims records with a concurrent-worker-safe SQL query", async () => {
    const repository = new OutboxRepository({ workerId: "worker-a" });

    await repository.claimBatch(10);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.queryRaw).toHaveBeenCalledOnce();

    const sql = mocks.queryRaw.mock.calls[0]![0].join(" ");

    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain('"repository"."event_outbox"');
    expect(sql).toContain('"deadLetteredAt" IS NULL');
  });

  it("marks a record published only when the worker owns its lease", async () => {
    const repository = new OutboxRepository({ workerId: "worker-a" });

    await repository.markPublished("outbox-1");

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "outbox-1",
          lockedBy: "worker-a",
          publishedAt: null,
          deadLetteredAt: null,
        }),
        data: expect.objectContaining({
          lockedBy: null,
          lockedUntil: null,
          lastError: null,
        }),
      }),
    );
  });

  it("reports a lost lease instead of updating another worker's record", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    const repository = new OutboxRepository({ workerId: "worker-a" });

    await expect(repository.markPublished("outbox-1"))
      .rejects.toThrow("OUTBOX_LEASE_LOST");
  });

  it("schedules a retry with an error message and releases the lease", async () => {
    const repository = new OutboxRepository({ workerId: "worker-a" });

    await repository.scheduleRetry("outbox-1", new Error("Kafka unavailable"));

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "outbox-1",
          lockedBy: "worker-a",
        }),
      }),
    );

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: "Kafka unavailable",
          lockedBy: null,
          lockedUntil: null,
          deadLetteredAt: null,
        }),
      }),
    );
  });

  it("dead-letters an event after the configured maximum attempts", async () => {
    mocks.findFirst.mockResolvedValueOnce({ attempts: 3 });

    const repository = new OutboxRepository({
      workerId: "worker-a",
      maxAttempts: 3,
    });

    await repository.scheduleRetry("outbox-1", new Error("Permanent failure"));

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deadLetteredAt: expect.any(Date),
          lastError: "Permanent failure",
        }),
      }),
    );
  });

  it("rejects retry scheduling when the lease is lost", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);

    const repository = new OutboxRepository({ workerId: "worker-a" });

    await expect(
      repository.scheduleRetry("outbox-1", new Error("Kafka unavailable")),
    ).rejects.toThrow("OUTBOX_LEASE_LOST");

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
