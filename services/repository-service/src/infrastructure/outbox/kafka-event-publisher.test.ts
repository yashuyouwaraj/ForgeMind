
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
  producer: vi.fn(),
  kafka: vi.fn(),
}));

vi.mock("kafkajs", () => ({
  Kafka: class {
    producer = mocks.producer;
    constructor(config: unknown) {
      mocks.kafka(config);
    }
  },
}));

import { KafkaEventPublisher } from "./kafka-event-publisher.js";

describe("KafkaEventPublisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.send.mockResolvedValue([]);
    mocks.producer.mockReturnValue({
      connect: mocks.connect,
      disconnect: mocks.disconnect,
      send: mocks.send,
    });
  });

  it("rejects an empty broker configuration", () => {
    expect(() => new KafkaEventPublisher("")).toThrow(
      "KAFKA_BROKERS must contain at least one broker",
    );
  });

  it("connects lazily and publishes to repository.events", async () => {
    const publisher = new KafkaEventPublisher("localhost:9092");

    await publisher.publish({
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
    });

    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "repository.events",
        acks: -1,
        messages: [
          expect.objectContaining({
            key: "44444444-4444-4444-8444-444444444444",
            headers: expect.objectContaining({
              eventId: "11111111-1111-4111-8111-111111111111",
              eventType: "RepositoryImported",
            }),
          }),
        ],
      }),
    );

    await publisher.close();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it("rejects publishing after shutdown starts", async () => {
    const publisher = new KafkaEventPublisher("localhost:9092");

    await publisher.close();

    await expect(
      publisher.publish({
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
      }),
    ).rejects.toThrow("KAFKA_PUBLISHER_CLOSING");
  });
});
