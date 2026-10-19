
import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  decodeRequest,
  isInsideRoot,
} from "./repository-parse-event-consumer.js";

const validEvent = {
  eventId: "event-123",
  eventType: "RepositoryParseRequested",
  eventVersion: 1,
  occurredAt: "2026-10-19T12:00:00.000Z",
  correlationId: "correlation-123",
  traceId: "trace-123",
  data: {
    repositoryId: "repository_123",
    projectId: "project-123",
    ownerId: "owner-123",
    headCommit: "a".repeat(40),
    requestedAt: "2026-10-19T12:00:00.000Z",
  },
};

function encode(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

describe("decodeRequest", () => {
  it("accepts a valid repository parse request", () => {
    const event = decodeRequest(encode(validEvent));

    expect(event.eventType).toBe("RepositoryParseRequested");
    expect(event.data.repositoryId).toBe("repository_123");
    expect(event.data.headCommit).toBe("a".repeat(40));
  });

  it("accepts a 64-character commit hash", () => {
    const event = {
      ...validEvent,
      data: {
        ...validEvent.data,
        headCommit: "b".repeat(64),
      },
    };

    expect(decodeRequest(encode(event)).data.headCommit).toBe(
      "b".repeat(64),
    );
  });

  it.each([
    ["null message", null],
    ["invalid JSON", Buffer.from("{invalid", "utf8")],
    ["missing event data", encode({ ...validEvent, data: undefined })],
    [
      "invalid repository ID",
      encode({
        ...validEvent,
        data: { ...validEvent.data, repositoryId: "../outside" },
      }),
    ],
    [
      "invalid commit hash",
      encode({
        ...validEvent,
        data: { ...validEvent.data, headCommit: "not-a-commit" },
      }),
    ],
    [
      "missing project ID",
      encode({
        ...validEvent,
        data: { ...validEvent.data, projectId: "" },
      }),
    ],
    [
      "invalid request timestamp",
      encode({
        ...validEvent,
        data: { ...validEvent.data, requestedAt: "not-a-date" },
      }),
    ],
    [
      "invalid event timestamp",
      encode({ ...validEvent, occurredAt: "not-a-date" }),
    ],
  ])("rejects %s", (_description, input) => {
    expect(() => decodeRequest(input)).toThrow(
      "INVALID_REPOSITORY_PARSE_REQUEST",
    );
  });
});

describe("isInsideRoot", () => {
  const root = path.resolve("test-workspaces", "repositories");

  it("accepts a repository nested under the workspace root", () => {
    expect(
      isInsideRoot(root, path.join(root, "repository-123")),
    ).toBe(true);
  });

  it("rejects the root itself", () => {
    expect(isInsideRoot(root, root)).toBe(false);
  });

  it("rejects a path outside the root", () => {
    expect(
      isInsideRoot(root, path.resolve(root, "..", "outside")),
    ).toBe(false);
  });
});
