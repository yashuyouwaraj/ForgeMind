
import type { RepositoryEvent } from "@forgemind/shared-events";

const SHA_PATTERN = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  );
}

function hasCommonEventFields(
  value: Record<string, unknown>,
): boolean {
  return (
    isNonEmptyString(value.eventId) &&
    isNonEmptyString(value.eventType) &&
    value.eventVersion === 1 &&
    isTimestamp(value.occurredAt) &&
    isNonEmptyString(value.correlationId) &&
    isNonEmptyString(value.traceId) &&
    isRecord(value.data)
  );
}

function hasRepositoryIdentity(data: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(data.repositoryId) &&
    isNonEmptyString(data.projectId) &&
    isNonEmptyString(data.ownerId)
  );
}

function isValidEventData(
  eventType: string,
  data: Record<string, unknown>,
): boolean {
  if (!hasRepositoryIdentity(data)) return false;

  switch (eventType) {
    case "RepositoryImported":
      return (
        isNonEmptyString(data.name) &&
        isNonEmptyString(data.provider) &&
        isNonEmptyString(data.url) &&
        (data.defaultBranch === null ||
          isNonEmptyString(data.defaultBranch))
      );

    case "RepositorySynchronized":
      return (
        isNonEmptyString(data.remoteUrl) &&
        (data.defaultBranch === null ||
          isNonEmptyString(data.defaultBranch)) &&
        (data.headCommit === null ||
          (typeof data.headCommit === "string" &&
            SHA_PATTERN.test(data.headCommit))) &&
        isTimestamp(data.synchronizedAt)
      );

    case "RepositorySyncFailed":
      return (
        isNonEmptyString(data.failureCode) &&
        typeof data.retryable === "boolean"
      );

    case "RepositorySyncRequested":
      return (
        (data.defaultBranch === null ||
          isNonEmptyString(data.defaultBranch)) &&
        isTimestamp(data.requestedAt)
      );

    case "RepositoryParseRequested":
      return (
        typeof data.headCommit === "string" &&
        SHA_PATTERN.test(data.headCommit) &&
        isTimestamp(data.requestedAt)
      );

    case "RepositoryParseFailed":
      return (
        typeof data.headCommit === "string" &&
        SHA_PATTERN.test(data.headCommit) &&
        isNonEmptyString(data.failureCode) &&
        typeof data.retryable === "boolean"
      );

    case "RepositoryParsed": {
      if (
        typeof data.headCommit !== "string" ||
        !SHA_PATTERN.test(data.headCommit) ||
        !isTimestamp(data.completedAt) ||
        !isRecord(data.summary)
      ) {
        return false;
      }

      const summary = data.summary;
      const counters = [
        summary.discoveredFiles,
        summary.parsedFiles,
        summary.failedFiles,
        summary.skippedFiles,
        summary.filesWithSyntaxErrors,
        summary.sourceBytesParsed,
      ];

      return (
        counters.every(
          (count) =>
            typeof count === "number" &&
            Number.isSafeInteger(count) &&
            count >= 0,
        ) &&
        typeof summary.truncated === "boolean"
      );
    }

    default:
      return false;
  }
}

export class RepositoryEventDecodeError extends Error {
  constructor(message = "INVALID_REPOSITORY_EVENT") {
    super(message);
    this.name = "RepositoryEventDecodeError";
  }
}

/**
 * Decode and validate an untrusted repository event.
 *
 * Unknown event types are rejected here. The Kafka consumer can then
 * distinguish malformed messages from valid events it should ignore.
 */
export function decodeRepositoryEvent(
  input: Buffer | string,
): RepositoryEvent {
  let value: unknown;

  try {
    value =
      typeof input === "string"
        ? JSON.parse(input)
        : JSON.parse(input.toString("utf8"));
  } catch {
    throw new RepositoryEventDecodeError("INVALID_REPOSITORY_EVENT_JSON");
  }

  if (!isRecord(value) || !hasCommonEventFields(value)) {
    throw new RepositoryEventDecodeError();
  }

  const data = value.data as Record<string, unknown>;

  if (!isValidEventData(value.eventType as string, data)) {
    throw new RepositoryEventDecodeError(
      "INVALID_REPOSITORY_EVENT_DATA",
    );
  }

  return value as unknown as RepositoryEvent;
}
