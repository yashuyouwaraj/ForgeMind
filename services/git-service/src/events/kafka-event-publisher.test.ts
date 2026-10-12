import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producer } from "kafkajs";
import type {
  RepositorySyncFailedEvent,
  RepositorySynchronizedEvent,
} from "@forgemind/shared-events";

const mocks = vi.hoisted(() => ({
  kafka: vi.fn(),
  connect: vi.fn<Producer["connect"]>(),
  disconnect: vi.fn<Producer["disconnect"]>(),
  send: vi.fn<Producer["send"]>(),
}));

vi.mock("kafkajs", () => ({
  Kafka: class {
    constructor(config: unknown) {
      mocks.kafka(config);
    }

    producer() {
      return {
        connect: mocks.connect,
        disconnect: mocks.disconnect,
        send: mocks.send,
      } satisfies Pick<Producer, "connect" | "disconnect" | "send">;
    }
  },
}));

import { KafkaEventPublisher } from "./kafka-event-publisher.js";

const synchronizedEvent: RepositorySynchronizedEvent = {
  eventId: "11111111-1111-4111-8111-111111111111",
  eventType: "RepositorySynchronized",
  eventVersion: 1,
  occurredAt: "2026-10-11T10:00:00.000Z",
  correlationId: "22222222-2222-4222-8222-222222222222",
  traceId: "33333333-3333-4333-8333-333333333333",
  data: {
    repositoryId: "44444444-4444-4444-8444-444444444444",
    projectId: "55555555-5555-4555-8555-555555555555",
    ownerId: "66666666-6666-4666-8666-666666666666",
    remoteUrl: "https://github.com/example/sample-repository",
    defaultBranch: "main",
    headCommit: "abcdef1234567890",
    synchronizedAt: "2026-10-11T10:00:00.000Z",
  },
};

const failedEvent: RepositorySyncFailedEvent = {
  eventId: "77777777-7777-4777-8777-777777777777",
  eventType: "RepositorySyncFailed",
  eventVersion: 1,
  occurredAt: "2026-10-11T10:05:00.000Z",
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

describe("KafkaEventPublisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.send.mockResolvedValue([]);
  });

  it.each([synchronizedEvent, failedEvent])(
    "serializes $eventType to repository.events",
    async (event) => {
      const publisher = new KafkaEventPublisher("localhost:9092");

      await publisher.publish(event);

      expect(mocks.connect).toHaveBeenCalledOnce();
      expect(mocks.send).toHaveBeenCalledWith({
        topic: "repository.events",
        acks: -1,
        messages: [
          {
            key: event.data.repositoryId,
            value: JSON.stringify(event),
            headers: {
              eventId: event.eventId,
              eventType: event.eventType,
              correlationId: event.correlationId,
              traceId: event.traceId,
            },
          },
        ],
      });
    },
  );

  it("propagates producer connection errors without sending", async () => {
    const error = new Error("Kafka connection failed");
    mocks.connect.mockRejectedValue(error);
    const publisher = new KafkaEventPublisher("localhost:9092");

    await expect(publisher.publish(synchronizedEvent)).rejects.toBe(error);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("propagates producer send errors", async () => {
    const error = new Error("Kafka publish failed");
    mocks.send.mockRejectedValue(error);
    const publisher = new KafkaEventPublisher("localhost:9092");

    await expect(publisher.publish(failedEvent)).rejects.toBe(error);
  });
});
