
import { randomUUID } from "node:crypto";
import type { Producer } from "kafkajs";
import { PrismaClient } from "../../generated/prisma/index.js";

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

interface OutboxPublisherOptions {
  readonly topic?: string;
  readonly deadLetterTopic?: string;
  readonly batchSize?: number;
  readonly leaseMs?: number;
  readonly maxAttempts?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

interface ClaimedOutboxEvent {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly leaseToken: string;
}

export interface OutboxPublishBatchResult {
  claimed: number;
  published: number;
  retried: number;
  deadLettered: number;
}

export class WorkflowOutboxPublisher {
  private readonly topic: string;
  private readonly deadLetterTopic: string;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private readonly client: PrismaClient,
    private readonly producer: Producer,
    options: OutboxPublisherOptions = {},
  ) {
    this.topic = options.topic ?? "repository.events";
    this.deadLetterTopic =
      options.deadLetterTopic ?? "repository.events.dlq";
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseBackoffMs =
      options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    this.maxBackoffMs =
      options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

    if (
      this.batchSize < 1 ||
      this.leaseMs < 1 ||
      this.maxAttempts < 1 ||
      this.baseBackoffMs < 1 ||
      this.maxBackoffMs < this.baseBackoffMs
    ) {
      throw new Error("Invalid workflow outbox publisher options.");
    }
  }

  async publishBatch(): Promise<OutboxPublishBatchResult> {
    const events = await this.claimBatch();

    const result: OutboxPublishBatchResult = {
      claimed: events.length,
      published: 0,
      retried: 0,
      deadLettered: 0,
    };

    for (const event of events) {
      try {
        await this.producer.send({
          topic: this.topic,
          messages: [
            {
              key: event.eventId,
              value: JSON.stringify(event.payload),
              headers: {
                eventId: event.eventId,
                eventType: event.eventType,
              },
            },
          ],
        });
      } catch (error) {
        const deadLettered = await this.handlePublishFailure(event, error);

        if (deadLettered) {
          result.deadLettered += 1;
        } else {
          result.retried += 1;
        }

        continue;
      }

      // Keep database failures separate from Kafka failures. The lease
      // expiry allows safe redelivery if this update fails.
      const updated = await this.client.workflowOutboxEvent.updateMany({
        where: {
          id: event.id,
          leaseToken: event.leaseToken,
          publishedAt: null,
        },
        data: {
          publishedAt: new Date(),
          leaseToken: null,
          leasedUntil: null,
          lastError: null,
        },
      });

      // If the lease was lost, another worker owns the row.
      // Do not overwrite that worker's state.
      if (updated.count === 1) {
        result.published += 1;
      }
    }

    return result;
  }

  private async claimBatch(): Promise<ClaimedOutboxEvent[]> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + this.leaseMs);

    return this.client.$transaction(async (tx) => {
      const candidates = await tx.workflowOutboxEvent.findMany({
        where: {
          publishedAt: null,
          deadLetteredAt: null,
          nextAttemptAt: { lte: now },
          OR: [
            { leasedUntil: null },
            { leasedUntil: { lte: now } },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: this.batchSize,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          payload: true,
        },
      });

      const claimed: ClaimedOutboxEvent[] = [];

      for (const candidate of candidates) {
        const leaseToken = randomUUID();

        const result = await tx.workflowOutboxEvent.updateMany({
          where: {
            id: candidate.id,
            publishedAt: null,
            deadLetteredAt: null,
            nextAttemptAt: { lte: now },
            OR: [
              { leasedUntil: null },
              { leasedUntil: { lte: now } },
            ],
          },
          data: {
            leaseToken,
            leasedUntil: leaseUntil,
          },
        });

        if (result.count !== 1) continue;

        const record = await tx.workflowOutboxEvent.findFirst({
          where: {
            id: candidate.id,
            leaseToken,
          },
          select: { attempts: true },
        });

        if (!record) continue;

        claimed.push({
          ...candidate,
          attempts: record.attempts,
          leaseToken,
        });
      }

      return claimed;
    });
  }

  private async handlePublishFailure(
    event: ClaimedOutboxEvent,
    error: unknown,
  ): Promise<boolean> {
    const message =
      error instanceof Error ? error.message : String(error);
    const nextAttemptCount = event.attempts + 1;

    if (nextAttemptCount >= this.maxAttempts) {
      try {
        await this.producer.send({
          topic: this.deadLetterTopic,
          messages: [
            {
              key: event.eventId,
              value: JSON.stringify({
                eventId: event.eventId,
                eventType: event.eventType,
                payload: event.payload,
                failure: message,
                attempts: nextAttemptCount,
                deadLetteredAt: new Date().toISOString(),
                source: "workflow-outbox",
              }),
            },
          ],
        });
      } catch (deadLetterError) {
        // A failed DLQ publish must not discard the original outbox row.
        await this.scheduleRetry(
          event,
          deadLetterError instanceof Error
            ? deadLetterError.message
            : String(deadLetterError),
        );
        return false;
      }

      const updated = await this.client.workflowOutboxEvent.updateMany({
        where: {
          id: event.id,
          leaseToken: event.leaseToken,
          publishedAt: null,
        },
        data: {
          attempts: { increment: 1 },
          deadLetteredAt: new Date(),
          lastError: message.slice(0, 2_000),
          leaseToken: null,
          leasedUntil: null,
        },
      });

      return updated.count === 1;
    }

    await this.scheduleRetry(event, message);
    return false;
  }

  private async scheduleRetry(
    event: ClaimedOutboxEvent,
    message: string,
  ): Promise<void> {
    const exponent = Math.min(event.attempts, 20);
    const delay = Math.min(
      this.baseBackoffMs * 2 ** exponent,
      this.maxBackoffMs,
    );

    await this.client.workflowOutboxEvent.updateMany({
      where: {
        id: event.id,
        leaseToken: event.leaseToken,
        publishedAt: null,
      },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: new Date(Date.now() + delay),
        lastError: message.slice(0, 2_000),
        leaseToken: null,
        leasedUntil: null,
      },
    });
  }
}
