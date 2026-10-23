import { createHash } from "node:crypto";
import type {
  RepositoryImportedEvent,
  RepositorySyncRequestedEvent,
  RepositorySyncFailedEvent,
  RepositorySynchronizedEvent,
} from "@forgemind/shared-events";
import type {
  GitOperationResult,
  GitOperations,
} from "../git/git-operations.js";

export interface RepositoryEventPublisher {
  publish(
    event: RepositorySynchronizedEvent | RepositorySyncFailedEvent,
  ): Promise<void>;
}

export interface RepositoryImportedHandlerDependencies {
  gitOperations: Pick<
    GitOperations,
    | "cloneRepository"
    | "synchronizeRepository"
    | "synchronizeRepositoryFromConfiguredRemote"
  >;
  publisher: RepositoryEventPublisher;
  retry?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
  };
}

interface OperationFailure {
  failureCode: string;
  retryable: boolean;
}

type OperationResult =
  | { success: true; result: GitOperationResult }
  | { success: false; failure: OperationFailure };

const PERMANENT_FAILURE_CODES = new Set([
  "INVALID_REPOSITORY_ID",
  "REPOSITORY_REMOTE_MISMATCH",
  "REPOSITORY_WORKSPACE_DIRTY",
  "REPOSITORY_DETACHED_HEAD",
]);

function isImportedEvent(value: unknown): value is RepositoryImportedEvent {
  if (typeof value !== "object" || value === null) return false;

  const event = value as Record<string, unknown>;
  const data = event.data;

  if (
    event.eventType !== "RepositoryImported" ||
    event.eventVersion !== 1 ||
    typeof event.eventId !== "string" ||
    !event.eventId.trim() ||
    typeof event.correlationId !== "string" ||
    !event.correlationId.trim() ||
    typeof event.traceId !== "string" ||
    !event.traceId.trim() ||
    typeof event.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    typeof data !== "object" ||
    data === null
  ) {
    return false;
  }

  const repository = data as Record<string, unknown>;

  return (
    typeof repository.repositoryId === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(repository.repositoryId) &&
    typeof repository.projectId === "string" &&
    repository.projectId.length > 0 &&
    typeof repository.ownerId === "string" &&
    repository.ownerId.length > 0 &&
    typeof repository.name === "string" &&
    typeof repository.provider === "string" &&
    typeof repository.url === "string" &&
    (typeof repository.defaultBranch === "string" ||
      repository.defaultBranch === null)
  );
}

function isSyncRequestedEvent(
  value: unknown,
): value is RepositorySyncRequestedEvent {
  if (typeof value !== "object" || value === null) return false;

  const event = value as Record<string, unknown>;
  const data = event.data;

  if (
    event.eventType !== "RepositorySyncRequested" ||
    event.eventVersion !== 1 ||
    typeof event.eventId !== "string" ||
    !event.eventId.trim() ||
    typeof event.correlationId !== "string" ||
    !event.correlationId.trim() ||
    typeof event.traceId !== "string" ||
    !event.traceId.trim() ||
    typeof event.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    typeof data !== "object" ||
    data === null
  ) {
    return false;
  }

  const repository = data as Record<string, unknown>;

  return (
    typeof repository.repositoryId === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(repository.repositoryId) &&
    typeof repository.projectId === "string" &&
    repository.projectId.length > 0 &&
    typeof repository.ownerId === "string" &&
    repository.ownerId.length > 0 &&
    (typeof repository.defaultBranch === "string" ||
      repository.defaultBranch === null) &&
    typeof repository.requestedAt === "string" &&
    Number.isFinite(Date.parse(repository.requestedAt))
  );
}

function outcomeEventId(sourceEventId: string, outcome: string): string {
  const bytes = createHash("sha1")
    .update(`forgemind:repository-imported:${sourceEventId}:${outcome}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function classifyFailure(error: unknown): OperationFailure {
  const message = error instanceof Error ? error.message : "";

  // Only expose stable codes, never raw Git output, URLs, credentials,
  // filesystem paths, or arbitrary third-party error messages.
  const knownCode = /^[A-Z][A-Z0-9_]{0,99}$/.test(message) ? message : "";

  const permanent =
    PERMANENT_FAILURE_CODES.has(knownCode) ||
    knownCode.startsWith("INVALID_") ||
    knownCode.startsWith("UNSUPPORTED_");

  return {
    failureCode: knownCode || "GIT_OPERATION_FAILED",
    retryable: !permanent,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createRepositoryImportedHandler({
  gitOperations,
  publisher,
  retry,
}: RepositoryImportedHandlerDependencies) {
  const maxAttempts = retry?.maxAttempts ?? 3;
  const initialDelayMs = retry?.initialDelayMs ?? 250;
  const maxDelayMs = retry?.maxDelayMs ?? 2_000;
  const sleep = retry?.sleep ?? delay;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("INVALID_GIT_RETRY_MAX_ATTEMPTS");
  }

  if (
    !Number.isFinite(initialDelayMs) ||
    initialDelayMs < 0 ||
    !Number.isFinite(maxDelayMs) ||
    maxDelayMs < initialDelayMs
  ) {
    throw new Error("INVALID_GIT_RETRY_DELAY");
  }

  async function execute(
    event: RepositoryImportedEvent | RepositorySyncRequestedEvent,
  ): Promise<OperationResult> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        let result: GitOperationResult;

        if (event.eventType === "RepositoryImported") {
          try {
            result = await gitOperations.cloneRepository(
              event.data.repositoryId,
              event.data.url,
            );
          } catch (error) {
            if (
              !(error instanceof Error) ||
              error.message !== "REPOSITORY_WORKSPACE_ALREADY_EXISTS"
            ) {
              throw error;
            }

            result = await gitOperations.synchronizeRepository(
              event.data.repositoryId,
              event.data.url,
            );
          }
        } else {
          result =
            await gitOperations.synchronizeRepositoryFromConfiguredRemote(
              event.data.repositoryId,
            );
        }

        return { success: true, result };
      } catch (error) {
        const failure = classifyFailure(error);

        if (!failure.retryable || attempt === maxAttempts) {
          return { success: false, failure };
        }

        const waitMs = Math.min(
          initialDelayMs * 2 ** (attempt - 1),
          maxDelayMs,
        );

        await sleep(waitMs);
      }
    }

    // Defensive fallback; validated maxAttempts guarantees the loop runs.
    return {
      success: false,
      failure: {
        failureCode: "GIT_OPERATION_FAILED",
        retryable: true,
      },
    };
  }

  return async function handleRepositoryEvent(
    value: unknown,
  ): Promise<void> {
    const isImported = isImportedEvent(value);
    const isSyncRequested = isSyncRequestedEvent(value);

    if (!isImported && !isSyncRequested) {
      const type =
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>).eventType
          : undefined;

      if (type === "RepositorySyncRequested") {
        throw new Error("INVALID_REPOSITORY_SYNC_REQUESTED_EVENT");
      }

      throw new Error("INVALID_REPOSITORY_IMPORTED_EVENT");
    }

    const event = isImported ? value : (value as RepositorySyncRequestedEvent);
    const repository = event.data;
    const operation = await execute(event);

    if (operation.success) {
      const result = operation.result;

      const outcome: RepositorySynchronizedEvent = {
        eventId: outcomeEventId(event.eventId, "synchronized"),
        eventType: "RepositorySynchronized",
        eventVersion: 1,
        occurredAt: result.completedAt,
        correlationId: event.correlationId,
        traceId: event.traceId,
        data: {
          repositoryId: repository.repositoryId,
          projectId: repository.projectId,
          ownerId: repository.ownerId,
          remoteUrl: result.remoteUrl,
          defaultBranch: repository.defaultBranch,
          headCommit: result.headCommit,
          synchronizedAt: result.completedAt,
        },
      };

      // Deliberately outside the Git-operation catch: publication failure
      // must propagate to the Kafka consumer.
      await publisher.publish(outcome);
      return;
    }

    const outcome: RepositorySyncFailedEvent = {
      eventId: outcomeEventId(event.eventId, "failed"),
      eventType: "RepositorySyncFailed",
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: event.correlationId,
      traceId: event.traceId,
      data: {
        repositoryId: repository.repositoryId,
        projectId: repository.projectId,
        ownerId: repository.ownerId,
        failureCode: operation.failure.failureCode,
        retryable: operation.failure.retryable,
      },
    };

    await publisher.publish(outcome);
  };
}
