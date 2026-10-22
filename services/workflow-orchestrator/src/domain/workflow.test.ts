
import { describe, expect, it } from "vitest";
import {
  Workflow,
  WorkflowDomainError,
} from "./workflow.js";

const createdAt = new Date("2026-10-19T10:00:00.000Z");

function createWorkflow() {
  return Workflow.create(
    {
      repositoryId: "repository-1",
      projectId: "project-1",
      ownerId: "owner-1",
      headCommit: "abc123",
      correlationId: "correlation-1",
      traceId: "trace-1",
      createdAt,
    },
    "workflow-1",
  );
}

describe("Workflow", () => {
  it("creates a pending workflow at the first pipeline stage", () => {
    const snapshot = createWorkflow().getSnapshot();

    expect(snapshot.status).toBe("PENDING");
    expect(snapshot.currentStage).toBe("REPOSITORY_SYNC");
    expect(snapshot.stageAttempt).toBe(0);
    expect(snapshot.startedAt).toBeNull();
  });

  it("allows a workflow to be created without a head commit", () => {
    const workflow = Workflow.create(
      {
        repositoryId: "repository-1",
        projectId: "project-1",
        ownerId: "owner-1",
        correlationId: "correlation-1",
        traceId: "trace-1",
        createdAt,
      },
      "workflow-1",
    );

    expect(workflow.getSnapshot().headCommit).toBeNull();
  });

  it("rejects missing required identifiers", () => {
    expect(() =>
      Workflow.create(
        {
          repositoryId: " ",
          projectId: "project-1",
          ownerId: "owner-1",
          headCommit: "abc123",
          correlationId: "correlation-1",
          traceId: "trace-1",
        },
        "workflow-1",
      ),
    ).toThrow(WorkflowDomainError);
  });

  it("starts and advances through stages in order", () => {
    const workflow = createWorkflow();
    const startedAt = new Date("2026-10-19T10:01:00.000Z");

    workflow.start(startedAt);

    expect(workflow.getSnapshot().status).toBe("RUNNING");

    workflow.completeStage(
      "REPOSITORY_SYNC",
      new Date("2026-10-19T10:02:00.000Z"),
    );

    const snapshot = workflow.getSnapshot();

    expect(snapshot.status).toBe("RUNNING");
    expect(snapshot.currentStage).toBe("REPOSITORY_PARSE");
  });

  it("records the synchronized head commit and completes repository sync", () => {
    const workflow = createWorkflow();
    workflow.start(new Date("2026-10-19T10:01:00.000Z"));

    workflow.synchronize(
      "verified-commit",
      new Date("2026-10-19T10:02:00.000Z"),
    );

    const snapshot = workflow.getSnapshot();

    expect(snapshot.headCommit).toBe("verified-commit");
    expect(snapshot.currentStage).toBe("REPOSITORY_PARSE");
  });

  it("rejects completion of a stage out of order", () => {
    const workflow = createWorkflow();
    workflow.start();

    expect(() => workflow.completeStage("UIR_GENERATION")).toThrow(
      WorkflowDomainError,
    );
  });

  it("schedules a retry and prevents resuming before it is due", () => {
    const workflow = createWorkflow();
    workflow.start();

    const failureAt = new Date("2026-10-19T10:02:00.000Z");
    const retryAt = new Date("2026-10-19T10:03:00.000Z");

    workflow.recordFailure(
      {
        code: "PARSER_TEMPORARY_FAILURE",
        message: "Parser worker unavailable.",
        retryable: true,
        occurredAt: failureAt,
      },
      retryAt,
    );

    expect(workflow.getSnapshot().status).toBe("RETRY_WAIT");

    expect(() => workflow.resumeRetry(failureAt)).toThrow(
      WorkflowDomainError,
    );

    workflow.resumeRetry(retryAt);

    const snapshot = workflow.getSnapshot();

    expect(snapshot.status).toBe("RUNNING");
    expect(snapshot.currentStage).toBe("REPOSITORY_SYNC");
    expect(snapshot.stageAttempt).toBe(1);
    expect(snapshot.nextAttemptAt).toBeNull();
  });

  it("marks a non-retryable failure as terminal", () => {
    const workflow = createWorkflow();
    workflow.start();

    workflow.recordFailure({
      code: "INVALID_REPOSITORY",
      message: "Repository metadata is invalid.",
      retryable: false,
      occurredAt: new Date("2026-10-19T10:02:00.000Z"),
    });

    expect(workflow.getSnapshot().status).toBe("FAILED");

    expect(() => workflow.resumeRetry()).toThrow(WorkflowDomainError);
  });

  it("completes only after the final pipeline stage", () => {
    const workflow = createWorkflow();
    workflow.start();

    const stages = [
      "REPOSITORY_SYNC",
      "REPOSITORY_PARSE",
      "SEMANTIC_ANALYSIS",
      "UIR_GENERATION",
      "KNOWLEDGE_GRAPH_UPDATE",
      "DIGITAL_TWIN_UPDATE",
      "IMPACT_ANALYSIS",
    ] as const;

    for (const stage of stages) {
      workflow.completeStage(stage, new Date("2026-10-19T10:05:00.000Z"));
    }

    const snapshot = workflow.getSnapshot();

    expect(snapshot.status).toBe("COMPLETED");
    expect(snapshot.completedAt).not.toBeNull();
  });

  it("does not expose mutable internal dates through snapshots", () => {
    const workflow = createWorkflow();
    const snapshot = workflow.getSnapshot();

    snapshot.createdAt.setUTCFullYear(2000);

    expect(workflow.getSnapshot().createdAt).toEqual(createdAt);
  });
});
