
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EachMessagePayload } from "kafkajs";
import { KafkaRepositoryEventConsumer } from "./repository-event-consumer.js";

const mocks = vi.hoisted(() => {
  const consumer = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue(undefined),
    commitOffsets: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };

  const producer = {
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };

  return { consumer, producer };
});

vi.mock("kafkajs", () => {
  class Kafka {
    consumer = vi.fn(() => mocks.consumer);
    producer = vi.fn(() => mocks.producer);

    constructor(_config: unknown) {}
  }

  return { Kafka };
});

const importedEvent = {
  eventId: "event-001",
  eventType: "RepositoryImported",
  eventVersion: 1,
  occurredAt: "2026-10-12T10:00:00.000Z",
  correlationId: "correlation-001",
  traceId: "trace-001",
  data: {
    repositoryId: "repo-001",
    projectId: "project-001",
    ownerId: "owner-001",
    name: "example",
    provider: "github",
    url: "https://github.com/example/example.git",
    defaultBranch: "main",
  },
};

function createMessage(
  value: string | null,
  offset = "10",
): EachMessagePayload {
  return {
    topic: "repository.events",
    partition: 0,
    message: {
      key: Buffer.from("repo-001"),
      value: value === null ? null : Buffer.from(value),
      offset,
      timestamp: "1781258400000",
      attributes: 0,
      size: 1,
    },
    heartbeat: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  };
}

async function getEachMessage() {
  const runOptions = mocks.consumer.run.mock.calls[0]?.[0] as
    | { eachMessage: (payload: EachMessagePayload) => Promise<void> }
    | undefined;

  if (!runOptions) {
    throw new Error("Consumer run callback was not registered");
  }

  return runOptions.eachMessage;
}

async function createStartedConsumer(
  handler: (event: unknown) => Promise<void>,
  options: ConstructorParameters<
    typeof KafkaRepositoryEventConsumer
  >[3] = {},
) {
  const consumer = new KafkaRepositoryEventConsumer(
    handler,
    "localhost:9092",
    "git-service-test",
    {
      initialRetryDelayMs: 0,
      maxRetryDelayMs: 0,
      sleep: async () => undefined,
      ...options,
    },
  );

  await consumer.start();
  return consumer;
}

describe("KafkaRepositoryEventConsumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.consumer.connect.mockResolvedValue(undefined);
    mocks.consumer.subscribe.mockResolvedValue(undefined);
    mocks.consumer.run.mockResolvedValue(undefined);
    mocks.consumer.commitOffsets.mockResolvedValue(undefined);
    mocks.consumer.stop.mockResolvedValue(undefined);
    mocks.consumer.disconnect.mockResolvedValue(undefined);

    mocks.producer.connect.mockResolvedValue(undefined);
    mocks.producer.send.mockResolvedValue(undefined);
    mocks.producer.disconnect.mockResolvedValue(undefined);
  });

  it("processes imported events before committing their offsets", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await createStartedConsumer(handler);

    const eachMessage = await getEachMessage();
    await eachMessage(createMessage(JSON.stringify(importedEvent)));

    expect(handler).toHaveBeenCalledWith(importedEvent);
    expect(mocks.consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: "repository.events", partition: 0, offset: "11" },
    ]);
    expect(mocks.producer.send).not.toHaveBeenCalled();
  });

  it("retries transient handler failures with bounded attempts", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("TEMPORARY_FAILURE"))
      .mockRejectedValueOnce(new Error("TEMPORARY_FAILURE"))
      .mockResolvedValue(undefined);

    await createStartedConsumer(handler, { maxProcessingAttempts: 3 });

    const eachMessage = await getEachMessage();
    await eachMessage(createMessage(JSON.stringify(importedEvent)));

    expect(handler).toHaveBeenCalledTimes(3);
    expect(mocks.producer.send).not.toHaveBeenCalled();
    expect(mocks.consumer.commitOffsets).toHaveBeenCalledTimes(1);
  });

  it("dead-letters malformed JSON and commits only after successful publication", async () => {
    await createStartedConsumer(vi.fn().mockResolvedValue(undefined));

    const eachMessage = await getEachMessage();
    await eachMessage(createMessage("{invalid-json"));

    expect(mocks.producer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "repository.events.dlq",
        acks: -1,
        messages: [
          expect.objectContaining({
            value: expect.stringContaining("INVALID_REPOSITORY_EVENT_JSON"),
          }),
        ],
      }),
    );

    expect(mocks.consumer.commitOffsets).toHaveBeenCalledWith([
      { topic: "repository.events", partition: 0, offset: "11" },
    ]);
  });

  it("does not commit the input offset when dead-letter publication fails", async () => {
    mocks.producer.send.mockRejectedValue(new Error("KAFKA_UNAVAILABLE"));

    await createStartedConsumer(vi.fn().mockResolvedValue(undefined));

    const eachMessage = await getEachMessage();

    await expect(
      eachMessage(createMessage("{invalid-json")),
    ).rejects.toThrow("KAFKA_UNAVAILABLE");

    expect(mocks.consumer.commitOffsets).not.toHaveBeenCalled();
  });

  it("dead-letters an event after retry exhaustion", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("TEMPORARY_FAILURE"));

    await createStartedConsumer(handler, { maxProcessingAttempts: 2 });

    const eachMessage = await getEachMessage();
    await eachMessage(createMessage(JSON.stringify(importedEvent)));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(mocks.producer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "repository.events.dlq",
        messages: [
          expect.objectContaining({
            value: expect.stringContaining("TEMPORARY_FAILURE"),
          }),
        ],
      }),
    );
    expect(mocks.consumer.commitOffsets).toHaveBeenCalledTimes(1);
  });

  it("does not process outcome events as Git operations", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await createStartedConsumer(handler);

    const eachMessage = await getEachMessage();
    await eachMessage(
      createMessage(
        JSON.stringify({
          eventId: "outcome-001",
          eventType: "RepositorySynchronized",
        }),
      ),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(mocks.consumer.commitOffsets).toHaveBeenCalledTimes(1);
  });

  it("dead-letters unsupported event types", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await createStartedConsumer(handler);

    const eachMessage = await getEachMessage();
    await eachMessage(
      createMessage(
        JSON.stringify({
          eventId: "unknown-001",
          eventType: "UnexpectedEvent",
        }),
      ),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(mocks.producer.send).toHaveBeenCalledTimes(1);
    expect(mocks.consumer.commitOffsets).toHaveBeenCalledTimes(1);
  });

  it("stops and disconnects the consumer and producer", async () => {
    const consumer = await createStartedConsumer(
      vi.fn().mockResolvedValue(undefined),
    );

    await consumer.close();

    expect(mocks.consumer.stop).toHaveBeenCalledTimes(1);
    expect(mocks.consumer.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.producer.disconnect).toHaveBeenCalledTimes(1);
  });
});
