import { describe, expect, it, vi } from "vitest";
import {
  decodeRepositoryEvent,
  RepositoryEventDecodeError,
} from "./repository-event-decoder.js";

const commit = "a".repeat(40);

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "event-001",
    eventType: "RepositorySynchronized",
    eventVersion: 1,
    occurredAt: "2026-10-22T10:00:00.000Z",
    correlationId: "correlation-001",
    traceId: "trace-001",
    data: {
      repositoryId: "repo-001",
      projectId: "project-001",
      ownerId: "owner-001",
      remoteUrl: "https://example.com/repo.git",
      defaultBranch: "main",
      headCommit: commit,
      synchronizedAt: "2026-10-22T10:00:00.000Z",
    },
    ...overrides,
  };
}


describe("decodeRepositoryEvent", () => {
  it("accepts a valid synchronization event", () => {
    const decoded = decodeRepositoryEvent(JSON.stringify(event()));

    expect(decoded.eventType).toBe("RepositorySynchronized");
    expect(decoded.eventId).toBe("event-001");
  });

  it("accepts a null head commit for an empty repository", () => {
    const decoded = decodeRepositoryEvent(
      JSON.stringify({
        ...event(),
        data: {
          ...(event().data as object),
          headCommit: null,
        },
      }),
    );

    expect(decoded.eventType).toBe("RepositorySynchronized");
  });

  it("rejects malformed JSON", () => {
    expect(() => decodeRepositoryEvent("{not-json")).toThrow(
      RepositoryEventDecodeError,
    );
  });

  it("rejects an unsupported event type", () => {
    expect(() =>
      decodeRepositoryEvent(
        JSON.stringify(event({ eventType: "UnknownEvent" })),
      ),
    ).toThrow("INVALID_REPOSITORY_EVENT_DATA");
  });

  it("rejects a malformed commit SHA", () => {
    expect(() =>
      decodeRepositoryEvent(
        JSON.stringify({
          ...event(),
          data: {
            ...(event().data as object),
            headCommit: "not-a-sha",
          },
        }),
      ),
    ).toThrow("INVALID_REPOSITORY_EVENT_DATA");
  });

  it("rejects an event with a missing correlation ID", () => {
    const invalid = event({ correlationId: "" });

    expect(() => decodeRepositoryEvent(JSON.stringify(invalid))).toThrow(
      "INVALID_REPOSITORY_EVENT",
    );
  });

  it("rejects negative parser counters", () => {
    const parsedEvent = {
      ...event({ eventType: "RepositoryParsed" }),
      data: {
        repositoryId: "repo-001",
        projectId: "project-001",
        ownerId: "owner-001",
        headCommit: commit,
        completedAt: "2026-10-22T10:00:00.000Z",
        summary: {
          discoveredFiles: 10,
          parsedFiles: -1,
          failedFiles: 0,
          skippedFiles: 0,
          filesWithSyntaxErrors: 0,
          sourceBytesParsed: 100,
          truncated: false,
        },
      },
    };

    expect(() => decodeRepositoryEvent(JSON.stringify(parsedEvent))).toThrow(
      "INVALID_REPOSITORY_EVENT_DATA",
    );
  });
});
