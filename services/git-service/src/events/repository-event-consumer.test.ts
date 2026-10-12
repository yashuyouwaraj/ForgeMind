import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Consumer, EachMessagePayload } from "kafkajs";
import type {
  RepositoryImportedEvent,
  RepositorySyncFailedEvent,
  RepositorySynchronizedEvent,
} from "@forgemind/shared-events";

const mocks = vi.hoisted(() => ({
  kafka: vi.fn(),
  connect: vi.fn<Consumer["connect"]>(),
  disconnect: vi.fn<Consumer["disconnect"]>(),
  stop: vi.fn<Consumer["stop"]>(),
  subscribe: vi.fn<Consumer["subscribe"]>(),
  run: vi.fn<Consumer["run"]>(),
  commitOffsets: vi.fn<Consumer["commitOffsets"]>(),
}));

vi.mock("kafkajs", () => ({
  Kafka: class {
    constructor(config: unknown) {
      mocks.kafka(config);
    }

    consumer() {
      return {
        connect: mocks.connect,
        disconnect: mocks.disconnect,
        stop: mocks.stop,
        subscribe: mocks.subscribe,
        run: mocks.run,
        commitOffsets: mocks.commitOffsets,
      } satisfies Pick<
        Consumer,
        | "connect"
        | "disconnect"
        | "stop"
        | "subscribe"
        | "run"
        | "commitOffsets"
      >;
    }
  },
}));

import { KafkaRepositoryEventConsumer } from "./repository-event-consumer.js";

const importedEvent: RepositoryImportedEvent = {
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

const synchronizedEvent: RepositorySynchronizedEvent = {
  eventId: "77777777-7777-4777-8777-777777777777",
  eventType: "RepositorySynchronized",
  eventVersion: 1,
  occurredAt: "2026-10-11T10:05:00.000Z",
  correlationId: "22222222-2222-4222-8222-222222222222",
  traceId: "33333333-3333-4333-8333-333333333333",
  data: {
    repositoryId: "44444444-4444-4444-8444-444444444444",
    projectId: "55555555-5555-4555-8555-555555555555",
    ownerId: "66666666-6666-4666-8666-666666666666",
    remoteUrl: "https://github.com/example/sample-repository",
    defaultBranch: "main",
    headCommit: "abcdef1234567890",
    synchronizedAt: "2026-10-11T10:05:00.000Z",
  },
};

const failedEvent: RepositorySyncFailedEvent = {
  eventId: "88888888-8888-4888-8888-888888888888",
  eventType: "RepositorySyncFailed",
  eventVersion: 1,
  occurredAt: "2026-10-11T10:10:00.000Z",
  correlationId: "22222222-2222-4222-8222-222222222222",
  traceId: "33333333-3333-4333-8333-333333333333",
  data: {
    repositoryId: "44444444-4444-4444-8444-444444444444",
    projectId: "55555555-5555-4555-8555-555555555555",
    ownerId: "66666666-6666-4666-8666-666666666666",
    failureCode: "GIT_OPERATION_FAILED",
    retryable: true,
  },
};

function messageFor(event: object, offset = "41"): EachMessagePayload {
  return {
    topic: "repository.events",
    partition: 2,
    heartbeat: async () => {},
    pause: () => () => {},
    message: {
      key: Buffer.from("repository-key"),
      value: Buffer.from(JSON.stringify(event)),
      timestamp: "1791712800000",
      attributes: 0,
      offset,
      headers: {},
    },
  };
}

async function deliverMessage(payload: EachMessagePayload): Promise<void> {
  const eachMessage = mocks.run.mock.calls[0]?.[0]?.eachMessage;

  if (!eachMessage) {
    throw new Error("Consumer did not register an eachMessage handler");
  }

  await eachMessage(payload);
}

describe("KafkaRepositoryEventConsumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.stop.mockResolvedValue(undefined);
    mocks.subscribe.mockResolvedValue(undefined);
    mocks.run.mockResolvedValue(undefined);
    mocks.commitOffsets.mockResolvedValue(undefined);
  });

  it("handles imported events before committing their offset", async () => {
    const operations: string[] = [];
    const handler = vi.fn(async () => {
      operations.push("handled");
    });
    mocks.commitOffsets.mockImplementation(async () => {
      operations.push("committed");
    });
    const consumer = new KafkaRepositoryEventConsumer(
      handler,
      "localhost:9092",
    );

    await consumer.start();
    await deliverMessage(messageFor(importedEvent, "41"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(importedEvent);
    expect(operations).toEqual(["handled", "committed"]);
    expect(mocks.commitOffsets).toHaveBeenCalledWith([
      {
        topic: "repository.events",
        partition: 2,
        offset: "42",
      },
    ]);
  });

  it.each([synchronizedEvent, failedEvent])(
    "commits $eventType events without invoking the imported-event handler",
    async (event) => {
      const handler = vi.fn(async () => undefined);
      const consumer = new KafkaRepositoryEventConsumer(
        handler,
        "localhost:9092",
      );

      await consumer.start();
      await deliverMessage(messageFor(event, "52"));

      expect(handler).not.toHaveBeenCalled();
      expect(mocks.commitOffsets).toHaveBeenCalledWith([
        {
          topic: "repository.events",
          partition: 2,
          offset: "53",
        },
      ]);
    },
  );

  it("does not commit an imported event when its handler fails", async () => {
    const error = new Error("Import handling failed");
    const handler = vi.fn(async () => {
      throw error;
    });
    const consumer = new KafkaRepositoryEventConsumer(
      handler,
      "localhost:9092",
    );

    await consumer.start();

    await expect(deliverMessage(messageFor(importedEvent))).rejects.toBe(
      error,
    );
    expect(mocks.commitOffsets).not.toHaveBeenCalled();
  });
});
