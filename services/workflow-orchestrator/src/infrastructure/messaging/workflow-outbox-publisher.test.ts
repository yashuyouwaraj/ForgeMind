
import { describe, expect, it, vi } from "vitest";
import type { Producer } from "kafkajs";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { WorkflowOutboxPublisher } from "./workflow-outbox-publisher.js";

function createHarness(attempts = 0) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });

  const tx = {
    workflowOutboxEvent: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "outbox-1",
          eventId: "event-1",
          eventType: "RepositoryParseRequested",
          payload: {
            eventId: "event-1",
            eventType: "RepositoryParseRequested",
          },
        },
      ]),
      updateMany,
      findFirst: vi.fn().mockResolvedValue({ attempts }),
    },
  };

  const client = {
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) =>
      callback(tx),
    ),
    workflowOutboxEvent: { updateMany },
  };

  const producer = {
    send: vi.fn().mockResolvedValue([]),
  };

  return {
    tx,
    client: client as unknown as PrismaClient,
    producer: producer as unknown as Producer,
    send: producer.send,
    updateMany,
  };
}

describe("WorkflowOutboxPublisher", () => {
  it("marks an event published after Kafka acknowledges it", async () => {
    const harness = createHarness();
    const publisher = new WorkflowOutboxPublisher(
      harness.client,
      harness.producer,
    );

    const result = await publisher.publishBatch();

    expect(harness.send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "repository.events",
      }),
    );
    expect(result).toEqual({
      claimed: 1,
      published: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("propagates a database failure after Kafka acknowledges publishing", async () => {
    const harness = createHarness();
    const databaseError = new Error("Database unavailable");
    harness.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(databaseError);
    const publisher = new WorkflowOutboxPublisher(
      harness.client,
      harness.producer,
    );

    await expect(publisher.publishBatch()).rejects.toBe(databaseError);
    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.updateMany).toHaveBeenCalledTimes(2);
  });

  it("schedules a retry when Kafka publishing fails", async () => {
    const harness = createHarness();
    harness.send.mockRejectedValueOnce(new Error("Kafka unavailable"));

    const publisher = new WorkflowOutboxPublisher(
      harness.client,
      harness.producer,
    );

    const result = await publisher.publishBatch();

    expect(result.retried).toBe(1);
    expect(result.deadLettered).toBe(0);
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempts: { increment: 1 },
          nextAttemptAt: expect.any(Date),
          leaseToken: null,
        }),
      }),
    );
  });

  it("sends exhausted events to the dead-letter topic", async () => {
    const harness = createHarness(7);
    harness.send.mockRejectedValueOnce(new Error("Kafka unavailable"));

    const publisher = new WorkflowOutboxPublisher(
      harness.client,
      harness.producer,
      { maxAttempts: 8 },
    );

    const result = await publisher.publishBatch();

    expect(result.deadLettered).toBe(1);
    expect(harness.send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "repository.events.dlq",
      }),
    );
    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deadLetteredAt: expect.any(Date),
        }),
      }),
    );
  });

  it("propagates a database failure after the dead-letter send succeeds", async () => {
    const harness = createHarness(7);
    const databaseError = new Error("Database unavailable");
    harness.send.mockRejectedValueOnce(new Error("Kafka unavailable"));
    harness.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(databaseError);
    const publisher = new WorkflowOutboxPublisher(
      harness.client,
      harness.producer,
      { maxAttempts: 8 },
    );

    await expect(publisher.publishBatch()).rejects.toBe(databaseError);
    expect(harness.send).toHaveBeenCalledTimes(2);
    expect(harness.updateMany).toHaveBeenCalledTimes(2);
  });
});
