
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { Workflow } from "../../domain/workflow.js";
import {
  WorkflowConcurrencyError,
  WorkflowNotFoundError,
} from "../../domain/workflow-repository.js";

vi.mock("../database/prisma.js", () => ({
  prisma: {},
}));

import { PrismaWorkflowRepository } from "./prisma-workflow-repository.js";

const timestamp = new Date("2026-10-19T10:00:00.000Z");

function createWorkflow(): Workflow {
  return Workflow.create(
    {
      repositoryId: "repository-id",
      projectId: "project-id",
      ownerId: "owner-id",
      headCommit: "commit-sha",
      correlationId: "correlation-id",
      traceId: "trace-id",
      createdAt: timestamp,
    },
    "workflow-id",
  );
}

function createRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "workflow-id",
    repositoryId: "repository-id",
    projectId: "project-id",
    ownerId: "owner-id",
    headCommit: "commit-sha",
    correlationId: "correlation-id",
    traceId: "trace-id",
    status: "PENDING",
    currentStage: "REPOSITORY_SYNC",
    stageAttempt: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
    nextAttemptAt: null,
    lastFailureCode: null,
    lastFailureMessage: null,
    lastFailureRetryable: null,
    lastFailureAt: null,
    version: 0,
    ...overrides,
  };
}

function createClientMock() {
  return {
    workflowExecution: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  } as unknown as PrismaClient;
}

describe("PrismaWorkflowRepository", () => {
  let client: PrismaClient;
  let repository: PrismaWorkflowRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createClientMock();
    repository = new PrismaWorkflowRepository(client);
  });

  it("creates a workflow with version zero", async () => {
    const workflow = createWorkflow();

    const result = await repository.create(workflow);

    expect(client.workflowExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "workflow-id",
        status: "PENDING",
        currentStage: "REPOSITORY_SYNC",
        version: 0,
      }),
    });
    expect(result.workflow).toBe(workflow);
    expect(result.version).toBe(0);
  });

  it("rehydrates a persisted workflow and its version", async () => {
    vi.mocked(client.workflowExecution.findUnique).mockResolvedValue(
      createRecord({
        status: "RUNNING",
        startedAt: timestamp,
        version: 4,
      }) as never,
    );

    const result = await repository.findById("workflow-id");

    expect(result).not.toBeNull();
    expect(result?.version).toBe(4);
    expect(result?.workflow.getSnapshot()).toMatchObject({
      id: "workflow-id",
      status: "RUNNING",
      startedAt: timestamp,
    });
  });

  it("returns null when a workflow does not exist", async () => {
    vi.mocked(client.workflowExecution.findUnique).mockResolvedValue(null);

    await expect(repository.findById("missing-id")).resolves.toBeNull();
  });

  it("increments the expected version on a successful save", async () => {
    const workflow = createWorkflow();
    workflow.start(timestamp);

    vi.mocked(client.workflowExecution.updateMany).mockResolvedValue({
      count: 1,
    } as never);

    const result = await repository.save(workflow, 2);

    expect(client.workflowExecution.updateMany).toHaveBeenCalledWith({
      where: {
        id: "workflow-id",
        version: 2,
      },
      data: expect.objectContaining({
        status: "RUNNING",
        version: { increment: 1 },
      }),
    });
    expect(result.workflow).toBe(workflow);
    expect(result.version).toBe(3);
  });

  it("rejects a stale version when another writer changed the workflow", async () => {
    const workflow = createWorkflow();

    vi.mocked(client.workflowExecution.updateMany).mockResolvedValue({
      count: 0,
    } as never);

    vi.mocked(client.workflowExecution.findUnique).mockResolvedValue({
      id: "workflow-id",
    } as never);

    await expect(repository.save(workflow, 0)).rejects.toBeInstanceOf(
      WorkflowConcurrencyError,
    );
  });

  it("reports a missing workflow when saving", async () => {
    const workflow = createWorkflow();

    vi.mocked(client.workflowExecution.updateMany).mockResolvedValue({
      count: 0,
    } as never);

    vi.mocked(client.workflowExecution.findUnique).mockResolvedValue(null);

    await expect(repository.save(workflow, 0)).rejects.toBeInstanceOf(
      WorkflowNotFoundError,
    );
  });

  it("rejects an invalid expected version", async () => {
    await expect(repository.save(createWorkflow(), -1)).rejects.toThrow(
      "expectedVersion must be a non-negative integer.",
    );

    expect(client.workflowExecution.updateMany).not.toHaveBeenCalled();
  });
});
