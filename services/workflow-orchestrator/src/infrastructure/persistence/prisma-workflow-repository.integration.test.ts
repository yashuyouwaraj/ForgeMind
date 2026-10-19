
import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { Workflow } from "../../domain/workflow.js";
import { WorkflowConcurrencyError } from "../../domain/workflow-repository.js";
import {
  disconnectPrisma,
  prisma,
} from "../database/prisma.js";
import { PrismaWorkflowRepository } from "./prisma-workflow-repository.js";

function assertSafeTestDatabase(): void {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured for integration tests.");
  }

  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    databaseName !== "forgemind"
  ) {
    throw new Error(
      "Integration tests are restricted to the local forgemind database.",
    );
  }
}

describe("PrismaWorkflowRepository integration", () => {
  const repository = new PrismaWorkflowRepository(prisma);
  const workflowId = randomUUID();

  beforeAll(async () => {
    if (process.env.FORGEMIND_WORKFLOW_INTEGRATION_TESTS !== "1") {
      throw new Error(
        "Set FORGEMIND_WORKFLOW_INTEGRATION_TESTS=1 to run database integration tests.",
      );
    }

    assertSafeTestDatabase();
    await prisma.$connect();
  });

  afterAll(async () => {
    try {
      await prisma.workflowExecution.deleteMany({
        where: { id: workflowId },
      });
    } finally {
      await disconnectPrisma();
    }
  });

  it("persists a workflow and rejects a competing stale update", async () => {
    const now = new Date();

    const workflow = Workflow.create(
      {
        repositoryId: randomUUID(),
        projectId: randomUUID(),
        ownerId: randomUUID(),
        headCommit: "integration-test-commit",
        correlationId: randomUUID(),
        traceId: randomUUID(),
        createdAt: now,
      },
      workflowId,
    );

    const created = await repository.create(workflow);

    expect(created.version).toBe(0);

    // Simulate two independent workers reading the same version.
    const workerA = await repository.findById(workflowId);
    const workerB = await repository.findById(workflowId);

    expect(workerA).not.toBeNull();
    expect(workerB).not.toBeNull();
    expect(workerA?.version).toBe(0);
    expect(workerB?.version).toBe(0);

    workerA!.workflow.start(new Date());

    const saved = await repository.save(
      workerA!.workflow,
      workerA!.version,
    );

    expect(saved.version).toBe(1);

    // Worker B still holds version zero and must not overwrite worker A.
    workerB!.workflow.start(new Date());

    await expect(
      repository.save(workerB!.workflow, workerB!.version),
    ).rejects.toBeInstanceOf(WorkflowConcurrencyError);

    const persisted = await repository.findById(workflowId);

    expect(persisted).not.toBeNull();
    expect(persisted?.version).toBe(1);
    expect(persisted?.workflow.getSnapshot().status).toBe("RUNNING");
  });
});
