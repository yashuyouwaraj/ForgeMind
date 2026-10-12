
import { createHash } from "node:crypto";
import type {
  RepositoryImportedEvent,
  RepositorySyncFailedEvent,
  RepositorySynchronizedEvent,
} from "@forgemind/shared-events";
import type { GitOperations } from "../git/git-operations.js";

export interface RepositoryEventPublisher {
  publish(
    event: RepositorySynchronizedEvent | RepositorySyncFailedEvent,
  ): Promise<void>;
}

export interface RepositoryImportedHandlerDependencies {
  gitOperations: Pick<
    GitOperations,
    "cloneRepository" | "synchronizeRepository"
  >;
  publisher: RepositoryEventPublisher;
}

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
    typeof event.traceId !== "string" ||
    typeof event.occurredAt !== "string" ||
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

/**
 * Deterministic UUID-shaped identifiers make a repeated delivery of the same
 * imported event produce the same outcome event ID.
 */
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

function getFailure(error: unknown): {
  failureCode: string;
  retryable: boolean;
} {
  const code =
    error instanceof Error ? error.message : "GIT_OPERATION_FAILED";

  const permanentCodes = new Set([
    "INVALID_REPOSITORY_ID",
    "INVALID_REPOSITORY_URL",
    "UNSUPPORTED_REPOSITORY_PROVIDER",
    "REPOSITORY_REMOTE_MISMATCH",
  ]);

  // Never publish raw Git errors, URLs, credentials, or filesystem paths.
  const knownCodes = new Set([
    ...permanentCodes,
    "REPOSITORY_WORKSPACE_ALREADY_EXISTS",
    "REPOSITORY_WORKSPACE_NOT_FOUND",
    "REPOSITORY_WORKSPACE_DIRTY",
    "REPOSITORY_DETACHED_HEAD",
  ]);

  return {
    failureCode: knownCodes.has(code) ? code : "GIT_OPERATION_FAILED",
    retryable: !permanentCodes.has(code),
  };
}

export function createRepositoryImportedHandler({
  gitOperations,
  publisher,
}: RepositoryImportedHandlerDependencies) {
  return async function handleRepositoryImported(
    value: unknown,
  ): Promise<void> {
    if (!isImportedEvent(value)) {
      throw new Error("INVALID_REPOSITORY_IMPORTED_EVENT");
    }

    const event = value;
    const repository = event.data;

    try {
      let result;

      try {
        result = await gitOperations.cloneRepository(
          repository.repositoryId,
          repository.url,
        );
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== "REPOSITORY_WORKSPACE_ALREADY_EXISTS"
        ) {
          throw error;
        }

        result = await gitOperations.synchronizeRepository(
          repository.repositoryId,
          repository.url,
        );
      }

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

      await publisher.publish(outcome);
    } catch (error) {
      const failure = getFailure(error);

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
          failureCode: failure.failureCode,
          retryable: failure.retryable,
        },
      };

      // If outcome publication fails, propagate the error. The Kafka input
      // must not be acknowledged as successfully handled.
      await publisher.publish(outcome);
    }
  };
}
