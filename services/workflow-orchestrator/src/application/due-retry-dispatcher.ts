import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { WorkflowConcurrencyError } from "../domain/workflow-repository.js";
import { PrismaWorkflowRepository } from "../infrastructure/persistence/prisma-workflow-repository.js";
import { prisma } from "../infrastructure/database/prisma.js";

type TransactionClient = Prisma.TransactionClient;

const DEFAULT_BATCH_SIZE = 25;

interface DueRetryDispatcherOptions {
  readonly batchSize?: number;
  readonly now?: () => Date;
}

export interface DueRetryDispatchResult {
  readonly scanned: number;
  readonly dispatched: number;
  readonly skipped: number;
  readonly invalid: number;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class DueRetryDispatcher {
  private readonly batchSize: number;
  private readonly now: () => Date;

  constructor(
    private readonly client: PrismaClient = prisma,
    options: DueRetryDispatcherOptions = {},
  ) {
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.now = options.now ?? (() => new Date());

    if (!Number.isInteger(this.batchSize) || this.batchSize < 1) {
      throw new Error("batchSize must be a positive integer.");
    }
  }

  async dispatchDueRetries(): Promise<DueRetryDispatchResult> {
    const now = this.now();
    if (!Number.isFinite(now.getTime())) {
      throw new Error("The retry dispatcher clock returned an invalid date.");
    }

    const candidates = await this.client.workflowExecution.findMany({
      where: {
        status: "RETRY_WAIT",
        nextAttemptAt: { lte: now },
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      take: this.batchSize,
      select: { id: true },
    });

    const result: {
      scanned: number;
      dispatched: number;
      skipped: number;
      invalid: number;
    } = {
      scanned: candidates.length,
      dispatched: 0,
      skipped: 0,
      invalid: 0,
    };

    for (const candidate of candidates) {
      try {
        const outcome = await this.client.$transaction(async (tx) => {
          const repository = new PrismaWorkflowRepository(
            tx as unknown as PrismaClient,
          );
          const persisted = await repository.findById(candidate.id);

          if (!persisted) return false;

          const snapshot = persisted.workflow.getSnapshot();
          if (
            snapshot.status !== "RETRY_WAIT" ||
            !snapshot.nextAttemptAt ||
            snapshot.nextAttemptAt.getTime() > now.getTime()
          ) {
            return "skipped" as const;
          }

          const failUnsupportedRetry = async (message: string) => {
            persisted.workflow.resumeRetry(now);
            persisted.workflow.recordFailure({
              code: "UNSUPPORTED_RETRY_STAGE",
              message,
              retryable: false,
              occurredAt: now,
            });
            await repository.save(persisted.workflow, persisted.version);
            return "invalid" as const;
          };

          const occurredAt = now.toISOString();
          const envelope = {
            eventId: randomUUID(),
            eventVersion: 1 as const,
            occurredAt,
            correlationId: snapshot.correlationId,
            traceId: snapshot.traceId,
          };

          let event:
            | {
                eventId: string;
                eventType: "RepositorySyncRequested";
                eventVersion: 1;
                occurredAt: string;
                correlationId: string;
                traceId: string;
                data: {
                  repositoryId: string;
                  projectId: string;
                  ownerId: string;
                  defaultBranch: string | null;
                  requestedAt: string;
                };
              }
            | {
                eventId: string;
                eventType: "RepositoryParseRequested";
                eventVersion: 1;
                occurredAt: string;
                correlationId: string;
                traceId: string;
                data: {
                  repositoryId: string;
                  projectId: string;
                  ownerId: string;
                  headCommit: string;
                  requestedAt: string;
                };
              };

          switch (snapshot.currentStage) {
            case "REPOSITORY_SYNC":
              event = {
                ...envelope,
                eventType: "RepositorySyncRequested",
                data: {
                  repositoryId: snapshot.repositoryId,
                  projectId: snapshot.projectId,
                  ownerId: snapshot.ownerId,
                  defaultBranch: null,
                  requestedAt: occurredAt,
                },
              };
              break;
            case "REPOSITORY_PARSE":
              if (!snapshot.headCommit) {
                return failUnsupportedRetry(
                  `Workflow '${snapshot.id}' cannot retry parsing without a head commit.`,
                );
              }
              event = {
                ...envelope,
                eventType: "RepositoryParseRequested",
                data: {
                  repositoryId: snapshot.repositoryId,
                  projectId: snapshot.projectId,
                  ownerId: snapshot.ownerId,
                  headCommit: snapshot.headCommit,
                  requestedAt: occurredAt,
                },
              };
              break;
            default:
              return failUnsupportedRetry(
                `Workflow '${snapshot.id}' has unsupported retry stage '${snapshot.currentStage}'.`,
              );
          }

          persisted.workflow.resumeRetry(now);
          await repository.save(persisted.workflow, persisted.version);

          await (tx as TransactionClient).workflowOutboxEvent.create({
            data: {
              eventId: event.eventId,
              eventType: event.eventType,
              payload: asJson(event),
            },
          });

          return "dispatched" as const;
        });

        if (outcome === "dispatched") {
          result.dispatched += 1;
        } else if (outcome === "invalid") {
          result.invalid += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error) {
        if (error instanceof WorkflowConcurrencyError) {
          result.skipped += 1;
          continue;
        }

        throw error;
      }
    }

    return result;
  }
}
