
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma.js";

export interface ClaimedOutboxEvent {
  id: string;
  eventId: string;
  eventType: string;
  eventVersion: number;
  payload: unknown;
  attempts: number;
}

export interface OutboxRepositoryOptions {
  workerId?: string;
  leaseDurationMs?: number;
  maxAttempts?: number;
}

export class OutboxRepository {
  private readonly workerId: string;
  private readonly leaseDurationMs: number;
  private readonly maxAttempts: number;

  constructor(options: OutboxRepositoryOptions = {}) {
    this.workerId = options.workerId ?? randomUUID();
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 10;

    if (!Number.isInteger(this.leaseDurationMs) || this.leaseDurationMs < 1_000) {
      throw new Error("INVALID_OUTBOX_LEASE_DURATION");
    }

    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error("INVALID_OUTBOX_MAX_ATTEMPTS");
    }
  }

  async claimBatch(batchSize = 20): Promise<ClaimedOutboxEvent[]> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
      throw new Error("INVALID_OUTBOX_BATCH_SIZE");
    }

    return prisma.$transaction(async (tx) => {
      return tx.$queryRaw<ClaimedOutboxEvent[]>`
        WITH eligible AS (
          SELECT "id"
          FROM "repository"."event_outbox"
          WHERE "publishedAt" IS NULL
            AND "deadLetteredAt" IS NULL
            AND "attempts" < ${this.maxAttempts}
            AND "nextAttemptAt" <= NOW()
            AND ("lockedUntil" IS NULL OR "lockedUntil" <= NOW())
          ORDER BY "createdAt" ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "repository"."event_outbox" AS outbox
        SET
          "lockedBy" = ${this.workerId},
          "lockedUntil" = NOW() + (${this.leaseDurationMs} * INTERVAL '1 millisecond'),
          "attempts" = outbox."attempts" + 1
        FROM eligible
        WHERE outbox."id" = eligible."id"
        RETURNING
          outbox."id",
          outbox."eventId",
          outbox."eventType",
          outbox."eventVersion",
          outbox."payload",
          outbox."attempts"
      `;
    });
  }

  async markPublished(id: string): Promise<void> {
    const result = await prisma.eventOutbox.updateMany({
      where: {
        id,
        lockedBy: this.workerId,
        lockedUntil: { gt: new Date() },
        publishedAt: null,
        deadLetteredAt: null,
      },
      data: {
        publishedAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
        lastError: null,
      },
    });

    if (result.count !== 1) {
      throw new Error("OUTBOX_LEASE_LOST");
    }
  }

  async scheduleRetry(id: string, error: unknown): Promise<void> {
    const record = await prisma.eventOutbox.findFirst({
      where: {
        id,
        lockedBy: this.workerId,
        lockedUntil: { gt: new Date() },
        publishedAt: null,
        deadLetteredAt: null,
      },
      select: { attempts: true },
    });

    if (!record) {
      throw new Error("OUTBOX_LEASE_LOST");
    }

    const exhausted = record.attempts >= this.maxAttempts;
    const delayMs = Math.min(
      1_000 * 2 ** Math.min(record.attempts - 1, 10),
      15 * 60 * 1_000,
    );

    const result = await prisma.eventOutbox.updateMany({
      where: {
        id,
        lockedBy: this.workerId,
        lockedUntil: { gt: new Date() },
        publishedAt: null,
        deadLetteredAt: null,
      },
      data: {
        deadLetteredAt: exhausted ? new Date() : null,
        nextAttemptAt: new Date(Date.now() + delayMs),
        lastError: (
          error instanceof Error ? error.message : "Unknown error"
        ).slice(0, 2_000),
        lockedBy: null,
        lockedUntil: null,
      },
    });

    if (result.count !== 1) {
      throw new Error("OUTBOX_LEASE_LOST");
    }
  }
}
