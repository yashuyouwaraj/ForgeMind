
import type { PrismaClient } from "../../generated/prisma/index.js";
import { prisma } from "../database/prisma.js";
import {
  Workflow,
  type WorkflowFailure,
  type WorkflowSnapshot,
} from "../../domain/workflow.js";
import {
  WorkflowConcurrencyError,
  WorkflowNotFoundError,
  type PersistedWorkflow,
  type WorkflowRepository,
} from "../../domain/workflow-repository.js";

type WorkflowExecutionRecord = NonNullable<
  Awaited<ReturnType<PrismaClient["workflowExecution"]["findUnique"]>>
>;

export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(workflow: Workflow): Promise<PersistedWorkflow> {
    const snapshot = workflow.getSnapshot();

    await this.client.workflowExecution.create({
      data: {
        id: snapshot.id,
        repositoryId: snapshot.repositoryId,
        projectId: snapshot.projectId,
        ownerId: snapshot.ownerId,
        headCommit: snapshot.headCommit,
        correlationId: snapshot.correlationId,
        traceId: snapshot.traceId,
        status: snapshot.status,
        currentStage: snapshot.currentStage,
        stageAttempt: snapshot.stageAttempt,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        startedAt: snapshot.startedAt,
        completedAt: snapshot.completedAt,
        nextAttemptAt: snapshot.nextAttemptAt,
        lastFailureCode: snapshot.lastFailure?.code ?? null,
        lastFailureMessage: snapshot.lastFailure?.message ?? null,
        lastFailureRetryable: snapshot.lastFailure?.retryable ?? null,
        lastFailureAt: snapshot.lastFailure?.occurredAt ?? null,
        version: 0,
      },
    });

    return { workflow, version: 0 };
  }

  async findById(id: string): Promise<PersistedWorkflow | null> {
    const record = await this.client.workflowExecution.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return {
      workflow: Workflow.rehydrate(this.toSnapshot(record)),
      version: record.version,
    };
  }

  async save(
    workflow: Workflow,
    expectedVersion: number,
  ): Promise<PersistedWorkflow> {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new Error("expectedVersion must be a non-negative integer.");
    }

    const snapshot = workflow.getSnapshot();

    const result = await this.client.workflowExecution.updateMany({
      where: {
        id: snapshot.id,
        version: expectedVersion,
      },
      data: {
        repositoryId: snapshot.repositoryId,
        projectId: snapshot.projectId,
        ownerId: snapshot.ownerId,
        headCommit: snapshot.headCommit,
        correlationId: snapshot.correlationId,
        traceId: snapshot.traceId,
        status: snapshot.status,
        currentStage: snapshot.currentStage,
        stageAttempt: snapshot.stageAttempt,
        updatedAt: snapshot.updatedAt,
        startedAt: snapshot.startedAt,
        completedAt: snapshot.completedAt,
        nextAttemptAt: snapshot.nextAttemptAt,
        lastFailureCode: snapshot.lastFailure?.code ?? null,
        lastFailureMessage: snapshot.lastFailure?.message ?? null,
        lastFailureRetryable: snapshot.lastFailure?.retryable ?? null,
        lastFailureAt: snapshot.lastFailure?.occurredAt ?? null,
        version: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      const existing = await this.client.workflowExecution.findUnique({
        where: { id: snapshot.id },
        select: { id: true },
      });

      if (!existing) {
        throw new WorkflowNotFoundError(snapshot.id);
      }

      throw new WorkflowConcurrencyError(snapshot.id);
    }

    return {
      workflow,
      version: expectedVersion + 1,
    };
  }

  private toSnapshot(record: WorkflowExecutionRecord): WorkflowSnapshot {
    const hasFailure =
      record.lastFailureCode !== null ||
      record.lastFailureMessage !== null ||
      record.lastFailureRetryable !== null ||
      record.lastFailureAt !== null;

    let lastFailure: WorkflowFailure | null = null;

    if (hasFailure) {
      if (
        record.lastFailureCode === null ||
        record.lastFailureMessage === null ||
        record.lastFailureRetryable === null ||
        record.lastFailureAt === null
      ) {
        throw new Error(
          `Workflow '${record.id}' contains an incomplete persisted failure.`,
        );
      }

      lastFailure = {
        code: record.lastFailureCode,
        message: record.lastFailureMessage,
        retryable: record.lastFailureRetryable,
        occurredAt: record.lastFailureAt,
      };
    }

    return {
      id: record.id,
      repositoryId: record.repositoryId,
      projectId: record.projectId,
      ownerId: record.ownerId,
      headCommit: record.headCommit,
      correlationId: record.correlationId,
      traceId: record.traceId,
      status: record.status,
      currentStage: record.currentStage,
      stageAttempt: record.stageAttempt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      nextAttemptAt: record.nextAttemptAt,
      lastFailure,
    };
  }
}
