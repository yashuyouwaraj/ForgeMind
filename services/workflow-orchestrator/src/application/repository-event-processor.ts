
import type { RepositoryEvent } from "@forgemind/shared-events";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { Workflow } from "../domain/workflow.js";
import { PrismaWorkflowRepository } from "../infrastructure/persistence/prisma-workflow-repository.js";
import { prisma } from "../infrastructure/database/prisma.js";

const RETRY_DELAY_MS = 30_000;

type TransactionClient = Prisma.TransactionClient;

export interface ProcessRepositoryEventResult {
  readonly outcome: "processed" | "duplicate";
  readonly eventId: string;
}

export class WorkflowEventProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowEventProcessingError";
  }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dateFrom(value: string): Date {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new WorkflowEventProcessingError("Event timestamp is invalid.");
  }

  return date;
}

function retryAt(occurredAt: string): Date {
  return new Date(dateFrom(occurredAt).getTime() + RETRY_DELAY_MS);
}

function isCommitSha(value: string): boolean {
  return /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(value);
}

export class RepositoryEventProcessor {
  constructor(private readonly client: PrismaClient = prisma) {}

  async process(
    event: RepositoryEvent,
  ): Promise<ProcessRepositoryEventResult> {
    return this.client.$transaction(async (tx) => {
      const inserted = await tx.workflowInboxEvent.createMany({
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          payload: asJson(event),
        },
        skipDuplicates: true,
      });

      if (inserted.count === 0) {
        return {
          outcome: "duplicate",
          eventId: event.eventId,
        };
      }

      await this.handleEvent(tx, event);

      await tx.workflowInboxEvent.update({
        where: { eventId: event.eventId },
        data: { processedAt: new Date() },
      });

      return {
        outcome: "processed",
        eventId: event.eventId,
      };
    });
  }

  private async handleEvent(
    tx: TransactionClient,
    event: RepositoryEvent,
  ): Promise<void> {
    switch (event.eventType) {
      case "RepositoryImported":
        await this.handleImported(tx, event);
        return;

      case "RepositorySynchronized":
        await this.handleSynchronized(tx, event);
        return;

      case "RepositorySyncFailed":
        await this.handleFailure(tx, event, "repository-sync");
        return;

      case "RepositoryParsed":
        await this.handleParsed(tx, event);
        return;

      case "RepositoryParseFailed":
        await this.handleFailure(tx, event, "repository-parse");
        return;

      case "RepositoryParseRequested":
        // This event belongs to the parser service. Never consume it
        // as a workflow completion or republish it from this processor.
        return;
    }
  }

  private async handleImported(
    tx: TransactionClient,
    event: Extract<RepositoryEvent, { eventType: "RepositoryImported" }>,
  ): Promise<void> {
    const repository = new PrismaWorkflowRepository(
      tx as unknown as PrismaClient,
    );

    const occurredAt = dateFrom(event.occurredAt);
    const workflow = Workflow.create(
      {
        repositoryId: event.data.repositoryId,
        projectId: event.data.projectId,
        ownerId: event.data.ownerId,
        headCommit: null,
        correlationId: event.correlationId,
        traceId: event.traceId,
        createdAt: occurredAt,
      },
      randomUUID(),
    );

    workflow.start(occurredAt);
    await repository.create(workflow);
  }

  private async handleSynchronized(
    tx: TransactionClient,
    event: Extract<RepositoryEvent, { eventType: "RepositorySynchronized" }>,
  ): Promise<void> {
    const repository = new PrismaWorkflowRepository(
      tx as unknown as PrismaClient,
    );

    const persisted = await this.findActiveWorkflow(
      tx,
      event.data.repositoryId,
      event.correlationId,
    );

    if (!persisted) {
      throw new WorkflowEventProcessingError(
        `No active workflow found for repository '${event.data.repositoryId}' and correlation '${event.correlationId}'.`,
      );
    }

    const synchronizedAt = dateFrom(event.data.synchronizedAt);
    const workflow = persisted.workflow;

    if (
      event.data.headCommit === null ||
      !isCommitSha(event.data.headCommit)
    ) {
      workflow.recordFailure({
        code: "REPOSITORY_HEAD_COMMIT_UNAVAILABLE",
        message: "Repository synchronization did not provide a valid commit SHA.",
        retryable: false,
        occurredAt: synchronizedAt,
      });

      await repository.save(workflow, persisted.version);
      return;
    }

    workflow.synchronize(event.data.headCommit, synchronizedAt);
    await repository.save(workflow, persisted.version);

    const parseRequestedEvent = {
      eventId: randomUUID(),
      eventType: "RepositoryParseRequested",
      eventVersion: 1,
      occurredAt: synchronizedAt.toISOString(),
      correlationId: event.correlationId,
      traceId: event.traceId,
      data: {
        repositoryId: event.data.repositoryId,
        projectId: event.data.projectId,
        ownerId: event.data.ownerId,
        headCommit: event.data.headCommit,
        requestedAt: synchronizedAt.toISOString(),
      },
    };

    await tx.workflowOutboxEvent.create({
      data: {
        eventId: parseRequestedEvent.eventId,
        eventType: parseRequestedEvent.eventType,
        payload: asJson(parseRequestedEvent),
      },
    });
  }

  private async handleParsed(
    tx: TransactionClient,
    event: Extract<RepositoryEvent, { eventType: "RepositoryParsed" }>,
  ): Promise<void> {
    const repository = new PrismaWorkflowRepository(
      tx as unknown as PrismaClient,
    );

    const persisted = await this.findActiveWorkflow(
      tx,
      event.data.repositoryId,
      event.correlationId,
    );

    if (!persisted) {
      throw new WorkflowEventProcessingError(
        `No active workflow found for parsed repository '${event.data.repositoryId}'.`,
      );
    }

    persisted.workflow.completeStage(
      "REPOSITORY_PARSE",
      dateFrom(event.data.completedAt),
    );

    await repository.save(persisted.workflow, persisted.version);
  }

  private async handleFailure(
    tx: TransactionClient,
    event: Extract<
      RepositoryEvent,
      { eventType: "RepositorySyncFailed" | "RepositoryParseFailed" }
    >,
    stage: "repository-sync" | "repository-parse",
  ): Promise<void> {
    const repository = new PrismaWorkflowRepository(
      tx as unknown as PrismaClient,
    );

    const persisted = await this.findActiveWorkflow(
      tx,
      event.data.repositoryId,
      event.correlationId,
    );

    if (!persisted) {
      throw new WorkflowEventProcessingError(
        `No active workflow found for ${stage} failure on repository '${event.data.repositoryId}'.`,
      );
    }

    const occurredAt = dateFrom(event.occurredAt);

    persisted.workflow.recordFailure(
      {
        code: event.data.failureCode,
        message: `${stage} failed: ${event.data.failureCode}`,
        retryable: event.data.retryable,
        occurredAt,
      },
      event.data.retryable ? retryAt(event.occurredAt) : undefined,
    );

    await repository.save(persisted.workflow, persisted.version);
  }

  private async findActiveWorkflow(
    tx: TransactionClient,
    repositoryId: string,
    correlationId: string,
  ) {
    const record = await tx.workflowExecution.findFirst({
      where: {
        repositoryId,
        correlationId,
        status: { in: ["RUNNING", "RETRY_WAIT"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!record) return null;

    const repository = new PrismaWorkflowRepository(
      tx as unknown as PrismaClient,
    );

    return repository.findById(record.id);
  }
}
