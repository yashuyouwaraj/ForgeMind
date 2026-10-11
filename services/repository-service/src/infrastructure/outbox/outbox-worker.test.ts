
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RepositoryEvent } from "@forgemind/shared-events";
import type { ClaimedOutboxEvent } from "./outbox-repository.js";

const mocks = vi.hoisted(() => ({
  claimBatch: vi.fn(),
  markPublished: vi.fn(),
  scheduleRetry: vi.fn(),
  publish: vi.fn(),
  close: vi.fn(),
  onError: vi.fn(),
}));

vi.mock("./outbox-repository.js", () => ({
  OutboxRepository: class {},
}));

import { OutboxWorker } from "./outbox-worker.js";

const event: RepositoryEvent = {
  eventId: "11111111-1111-4111-8111-111111111111",
  eventType: "RepositoryImported",
  eventVersion: 1,
  occurredAt: "2026-10-11T10:00:00.000Z",
  correlationId: "22222222-2222-4222-8222-222222222222",
  traceId: "33333333-3333-4333-8333-333333333333",
  data: {
    repositoryId: "44444444-4444-4444-8444-444444444444",
    projectId: "55555555-5555-4555-8555-555555555555",
    ownerId: "66666666-6666-4666-8666-666666666666",
    name: "sample-repository",
    provider: "GITHUB",
    url: "https://github.com/example/sample-repository",
    defaultBranch: "main",
  },
};

const record: ClaimedOutboxEvent = {
  id: "77777777-7777-4777-8777-777777777777",
  eventId: event.eventId,
  eventType: event.eventType,
  eventVersion: event.eventVersion,
  payload: event,
  attempts: 1,
};

function createWorker() {
  return new OutboxWorker(
    {
      claimBatch: mocks.claimBatch,
      markPublished: mocks.markPublished,
      scheduleRetry: mocks.scheduleRetry,
    } as unknown as ConstructorParameters<typeof OutboxWorker>[0],
    {
      publish: mocks.publish,
      close: mocks.close,
    },
    {
      onError: mocks.onError,
    },
  );
}

describe("OutboxWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimBatch.mockResolvedValue([record]);
    mocks.markPublished.mockResolvedValue(undefined);
    mocks.scheduleRetry.mockResolvedValue(undefined);
    mocks.publish.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
  });

  it("publishes an event and marks it published after acknowledgement", async () => {
    const worker = createWorker();

    await worker.runOnce();

    expect(mocks.publish).toHaveBeenCalledWith(event);
    expect(mocks.markPublished).toHaveBeenCalledWith(record.id);
    expect(mocks.scheduleRetry).not.toHaveBeenCalled();
  });

  it("schedules a retry when publishing fails", async () => {
    const failure = new Error("Kafka unavailable");
    mocks.publish.mockRejectedValueOnce(failure);

    const worker = createWorker();

    await worker.runOnce();

    expect(mocks.markPublished).not.toHaveBeenCalled();
    expect(mocks.scheduleRetry).toHaveBeenCalledWith(record.id, failure);
    expect(mocks.onError).toHaveBeenCalled();
  });

  it("schedules retry when the outbox acknowledgement fails", async () => {
    const failure = new Error("Database unavailable");
    mocks.markPublished.mockRejectedValueOnce(failure);

    const worker = createWorker();

    await worker.runOnce();

    expect(mocks.publish).toHaveBeenCalledWith(event);
    expect(mocks.scheduleRetry).toHaveBeenCalledWith(record.id, failure);
  });

  it("does not publish an invalid event payload", async () => {
    mocks.claimBatch.mockResolvedValueOnce([
      { ...record, payload: { eventType: "UnexpectedEvent" } },
    ]);

    const worker = createWorker();

    await worker.runOnce();

    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.scheduleRetry).toHaveBeenCalledWith(
      record.id,
      expect.objectContaining({ message: "INVALID_OUTBOX_EVENT_PAYLOAD" }),
    );
  });

  it("handles retry bookkeeping failure without crashing the batch", async () => {
    mocks.publish.mockRejectedValueOnce(new Error("Kafka unavailable"));
    mocks.scheduleRetry.mockRejectedValueOnce(
      new Error("Lease lost"),
    );
    mocks.claimBatch.mockResolvedValueOnce([
      record,
      { ...record, id: "88888888-8888-4888-8888-888888888888" },
    ]);

    const worker = createWorker();

    await expect(worker.runOnce()).resolves.toBeUndefined();

    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.onError).toHaveBeenCalledWith(
      "Failed to update outbox retry state",
      expect.any(Error),
    );
  });

  it("closes the publisher during shutdown", async () => {
    const worker = createWorker();

    await worker.stop();

    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("rejects invalid worker configuration", () => {
    expect(
      () =>
        new OutboxWorker(
          {} as ConstructorParameters<typeof OutboxWorker>[0],
          { publish: mocks.publish, close: mocks.close },
          { batchSize: 101 },
        ),
    ).toThrow("INVALID_OUTBOX_WORKER_BATCH_SIZE");
  });
});
