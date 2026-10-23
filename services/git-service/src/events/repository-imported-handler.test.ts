import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RepositoryImportedEvent,
  RepositorySyncRequestedEvent,
} from "@forgemind/shared-events";
import {
  createRepositoryImportedHandler,
  type RepositoryEventPublisher,
} from "./repository-imported-handler.js";
import type { GitOperations } from "../git/git-operations.js";

const importedEvent: RepositoryImportedEvent = {
  eventId: "event-import-001",
  eventType: "RepositoryImported",
  eventVersion: 1,
  occurredAt: "2026-10-12T10:00:00.000Z",
  correlationId: "correlation-001",
  traceId: "trace-001",
  data: {
    repositoryId: "repository-001",
    projectId: "project-001",
    ownerId: "owner-001",
    name: "sample-repository",
    provider: "github",
    url: "https://github.com/example/sample-repository.git",
    defaultBranch: "main",
  },
};

const syncRequestedEvent: RepositorySyncRequestedEvent = {
  eventId: "event-sync-requested-001",
  eventType: "RepositorySyncRequested",
  eventVersion: 1,
  occurredAt: "2026-10-12T10:01:00.000Z",
  correlationId: "correlation-001",
  traceId: "trace-001",
  data: {
    repositoryId: "repository-001",
    projectId: "project-001",
    ownerId: "owner-001",
    defaultBranch: "main",
    requestedAt: "2026-10-12T10:01:00.000Z",
  },
};

const gitResult = {
  repositoryId: "repository-001",
  workspacePath: "/workspace/repository-001",
  remoteUrl: "https://github.com/example/sample-repository.git",
  branch: "main",
  headCommit: "abc123def456",
  completedAt: "2026-10-12T10:00:05.000Z",
};

function createDependencies() {
  const gitOperations = {
    cloneRepository: vi.fn().mockResolvedValue(gitResult),
    synchronizeRepository: vi.fn().mockResolvedValue(gitResult),
    synchronizeRepositoryFromConfiguredRemote: vi
      .fn()
      .mockResolvedValue(gitResult),
  } as unknown as Pick<
    GitOperations,
    | "cloneRepository"
    | "synchronizeRepository"
    | "synchronizeRepositoryFromConfiguredRemote"
  >;

  const publisher: RepositoryEventPublisher = {
    publish: vi.fn().mockResolvedValue(undefined),
  };

  const sleep = vi.fn().mockResolvedValue(undefined);

  return { gitOperations, publisher, sleep };
}

describe("createRepositoryImportedHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clones a new repository and publishes RepositorySynchronized", async () => {
    const { gitOperations, publisher } = createDependencies();

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
    });

    await handler(importedEvent);

    expect(gitOperations.cloneRepository).toHaveBeenCalledWith(
      "repository-001",
      importedEvent.data.url,
    );
    expect(gitOperations.synchronizeRepository).not.toHaveBeenCalled();

    expect(publisher.publish).toHaveBeenCalledTimes(1);

    const published = vi.mocked(publisher.publish).mock.calls[0]?.[0];

    expect(published).toMatchObject({
      eventType: "RepositorySynchronized",
      eventVersion: 1,
      correlationId: "correlation-001",
      traceId: "trace-001",
      data: {
        repositoryId: "repository-001",
        projectId: "project-001",
        ownerId: "owner-001",
        headCommit: "abc123def456",
      },
    });
  });

  it("synchronizes when the workspace already exists", async () => {
    const { gitOperations, publisher } = createDependencies();

    vi.mocked(gitOperations.cloneRepository).mockRejectedValue(
      new Error("REPOSITORY_WORKSPACE_ALREADY_EXISTS"),
    );

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
    });

    await handler(importedEvent);

    expect(gitOperations.cloneRepository).toHaveBeenCalledTimes(1);
    expect(gitOperations.synchronizeRepository).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "RepositorySynchronized",
      }),
    );
  });

  it("synchronizes a retry request using the configured remote", async () => {
    const { gitOperations, publisher } = createDependencies();

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
    });

    await handler(syncRequestedEvent);

    expect(gitOperations.cloneRepository).not.toHaveBeenCalled();
    expect(gitOperations.synchronizeRepository).not.toHaveBeenCalled();
    expect(
      gitOperations.synchronizeRepositoryFromConfiguredRemote,
    ).toHaveBeenCalledWith("repository-001");
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "RepositorySynchronized",
        data: expect.objectContaining({
          repositoryId: "repository-001",
          projectId: "project-001",
          ownerId: "owner-001",
          defaultBranch: "main",
          headCommit: "abc123def456",
        }),
      }),
    );
  });

  it("retries transient failures with exponential backoff", async () => {
    const { gitOperations, publisher, sleep } = createDependencies();

    vi.mocked(gitOperations.cloneRepository)
      .mockRejectedValueOnce(new Error("REMOTE_TEMPORARILY_UNAVAILABLE"))
      .mockRejectedValueOnce(new Error("REMOTE_TEMPORARILY_UNAVAILABLE"))
      .mockResolvedValue(gitResult);

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 100,
        maxDelayMs: 1_000,
        sleep,
      },
    });

    await handler(importedEvent);

    expect(gitOperations.cloneRepository).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
    expect(publisher.publish).toHaveBeenCalledTimes(1);

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "RepositorySynchronized",
      }),
    );
  });

  it("does not retry permanent failures", async () => {
    const { gitOperations, publisher, sleep } = createDependencies();

    vi.mocked(gitOperations.cloneRepository).mockRejectedValue(
      new Error("REPOSITORY_REMOTE_MISMATCH"),
    );

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
      retry: { sleep },
    });

    await handler(importedEvent);

    expect(gitOperations.cloneRepository).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "RepositorySyncFailed",
        data: expect.objectContaining({
          failureCode: "REPOSITORY_REMOTE_MISMATCH",
          retryable: false,
        }),
      }),
    );
  });

  it("publishes a sanitized retryable failure after exhausting retries", async () => {
    const { gitOperations, publisher, sleep } = createDependencies();

    vi.mocked(gitOperations.cloneRepository).mockRejectedValue(
      new Error("fatal: private credentials and remote details"),
    );

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
      retry: {
        maxAttempts: 2,
        initialDelayMs: 10,
        maxDelayMs: 20,
        sleep,
      },
    });

    await handler(importedEvent);

    expect(gitOperations.cloneRepository).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "RepositorySyncFailed",
        data: expect.objectContaining({
          failureCode: "GIT_OPERATION_FAILED",
          retryable: true,
        }),
      }),
    );

    const published = vi.mocked(publisher.publish).mock.calls[0]?.[0];

    expect(JSON.stringify(published)).not.toContain("private credentials");
  });

  it("uses a stable outcome event ID for the same source event and outcome", async () => {
    const first = createDependencies();
    const second = createDependencies();

    await createRepositoryImportedHandler(first)(importedEvent);
    await createRepositoryImportedHandler(second)(importedEvent);

    const firstEvent = vi.mocked(first.publisher.publish).mock.calls[0]?.[0];
    const secondEvent = vi.mocked(second.publisher.publish).mock.calls[0]?.[0];

    expect(firstEvent?.eventId).toBe(secondEvent?.eventId);
  });

  it("propagates outcome publication failures without publishing a false failure event", async () => {
    const { gitOperations, publisher } = createDependencies();

    vi.mocked(publisher.publish).mockRejectedValue(
      new Error("KAFKA_UNAVAILABLE"),
    );

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
    });

    await expect(handler(importedEvent)).rejects.toThrow("KAFKA_UNAVAILABLE");

    expect(gitOperations.cloneRepository).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed input before performing Git operations", async () => {
    const { gitOperations, publisher } = createDependencies();

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
    });

    await expect(
      handler({
        ...importedEvent,
        data: {
          ...importedEvent.data,
          repositoryId: "../outside-workspace",
        },
      }),
    ).rejects.toThrow("INVALID_REPOSITORY_IMPORTED_EVENT");

    expect(gitOperations.cloneRepository).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("rejects retry requests with an invalid requestedAt timestamp", async () => {
    const { gitOperations, publisher } = createDependencies();

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
    });

    await expect(
      handler({
        ...syncRequestedEvent,
        data: { ...syncRequestedEvent.data, requestedAt: "not-a-date" },
      }),
    ).rejects.toThrow("INVALID_REPOSITORY_SYNC_REQUESTED_EVENT");

    expect(
      gitOperations.synchronizeRepositoryFromConfiguredRemote,
    ).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("does not publish RepositorySynchronized when synchronization fails", async () => {
    const { gitOperations, publisher, sleep } = createDependencies();

    vi.mocked(gitOperations.cloneRepository).mockRejectedValue(
      new Error("REPOSITORY_WORKSPACE_ALREADY_EXISTS"),
    );

    vi.mocked(gitOperations.synchronizeRepository).mockRejectedValue(
      new Error("FETCH_FAILED"),
    );

    const handler = createRepositoryImportedHandler({
      gitOperations,
      publisher,
      retry: {
        maxAttempts: 2,
        initialDelayMs: 10,
        maxDelayMs: 20,
        sleep,
      },
    });

    await handler(importedEvent);

    expect(gitOperations.cloneRepository).toHaveBeenCalledTimes(2);
    expect(gitOperations.synchronizeRepository).toHaveBeenCalledTimes(2);

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "RepositorySyncFailed",
        data: expect.objectContaining({
          failureCode: "FETCH_FAILED",
          retryable: true,
        }),
      }),
    );

    expect(publisher.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "RepositorySynchronized",
      }),
    );
  });
});
