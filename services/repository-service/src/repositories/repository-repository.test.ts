
import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, repositoryCreate, outboxCreate, repositoryFindUnique, repositoryFindMany, repositoryCount } =
  vi.hoisted(() => ({
    transaction: vi.fn(),
    repositoryCreate: vi.fn(),
    outboxCreate: vi.fn(),
    repositoryFindUnique: vi.fn(),
    repositoryFindMany: vi.fn(),
    repositoryCount: vi.fn(),
  }));

vi.mock("../infrastructure/database/prisma.js", () => ({
  prisma: {
    $transaction: transaction,
    repository: {
      findUnique: repositoryFindUnique,
      findMany: repositoryFindMany,
      count: repositoryCount,
    },
  },
}));

import { RepositoryRepository } from "./repository-repository.js";

const input = {
  projectId: "22222222-2222-4222-8222-222222222222",
  name: "sample-repository",
  provider: "GITHUB" as const,
  defaultBranch: "main",
  url: "https://github.com/example/sample-repository",
};

const context = {
  ownerId: "33333333-3333-4333-8333-333333333333",
  correlationId: "44444444-4444-4444-8444-444444444444",
  traceId: "55555555-5555-4555-8555-555555555555",
};

const createdRepository = {
  id: "11111111-1111-4111-8111-111111111111",
  ...input,
  status: "Registered",
  createdAt: new Date("2026-10-11T10:00:00.000Z"),
  updatedAt: new Date("2026-10-11T10:00:00.000Z"),
};

describe("RepositoryRepository transactional outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    repositoryCreate.mockResolvedValue(createdRepository);
    outboxCreate.mockResolvedValue({});

    transaction.mockImplementation(async (callback) =>
      callback({
        repository: { create: repositoryCreate },
        eventOutbox: { create: outboxCreate },
      }),
    );
  });

  it("creates the repository and event within the same transaction", async () => {
    const repositoryRepository = new RepositoryRepository();

    const result = await repositoryRepository.create(input, context);

    expect(result).toEqual(createdRepository);
    expect(transaction).toHaveBeenCalledOnce();
    expect(repositoryCreate).toHaveBeenCalledOnce();
    expect(outboxCreate).toHaveBeenCalledOnce();
  });

  it("writes a correctly correlated RepositoryImported event", async () => {
    const repositoryRepository = new RepositoryRepository();

    await repositoryRepository.create(input, context);

    const outboxRecord = outboxCreate.mock.calls[0]?.[0]?.data;
    const event = outboxRecord?.payload;

    expect(outboxRecord.eventType).toBe("RepositoryImported");
    expect(outboxRecord.eventVersion).toBe(1);
    expect(outboxRecord.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(event).toMatchObject({
      eventId: outboxRecord.eventId,
      eventType: "RepositoryImported",
      eventVersion: 1,
      correlationId: context.correlationId,
      traceId: context.traceId,
      data: {
        repositoryId: createdRepository.id,
        projectId: createdRepository.projectId,
        ownerId: context.ownerId,
        name: createdRepository.name,
        provider: createdRepository.provider,
        url: createdRepository.url,
        defaultBranch: createdRepository.defaultBranch,
      },
    });

    expect(new Date(event.occurredAt).toString()).not.toBe("Invalid Date");
  });

  it("propagates an outbox write failure so the transaction can roll back", async () => {
    const failure = new Error("Outbox insert failed");
    outboxCreate.mockRejectedValue(failure);

    const repositoryRepository = new RepositoryRepository();

    await expect(
      repositoryRepository.create(input, context),
    ).rejects.toThrow("Outbox insert failed");

    expect(transaction).toHaveBeenCalledOnce();
    expect(repositoryCreate).toHaveBeenCalledOnce();
    expect(outboxCreate).toHaveBeenCalledOnce();
  });
});
