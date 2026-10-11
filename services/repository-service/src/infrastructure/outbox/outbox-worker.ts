
import type { RepositoryEvent } from "@forgemind/shared-events";
import type {
  ClaimedOutboxEvent,
  OutboxRepository,
} from "./outbox-repository.js";
import type { EventPublisher } from "./kafka-event-publisher.js";

export interface OutboxWorkerOptions {
  batchSize?: number;
  pollIntervalMs?: number;
  onError?: (message: string, error: unknown) => void;
}

function isRepositoryEvent(value: unknown): value is RepositoryEvent {
  if (!value || typeof value !== "object") return false;

  const event = value as Record<string, unknown>;
  const data = event.data;

  if (!data || typeof data !== "object") return false;

  const eventData = data as Record<string, unknown>;

  return (
    typeof event.eventId === "string" &&
    typeof event.eventType === "string" &&
    [
      "RepositoryImported",
      "RepositorySynchronized",
      "RepositorySyncFailed",
    ].includes(event.eventType) &&
    event.eventVersion === 1 &&
    typeof event.occurredAt === "string" &&
    typeof event.correlationId === "string" &&
    typeof event.traceId === "string" &&
    typeof eventData.repositoryId === "string"
  );
}

export class OutboxWorker {
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly onError: (message: string, error: unknown) => void;
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publisher: EventPublisher,
    options: OutboxWorkerOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 20;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.onError =
      options.onError ??
      ((message, error) => console.error(message, error));

    if (
      !Number.isInteger(this.batchSize) ||
      this.batchSize < 1 ||
      this.batchSize > 100
    ) {
      throw new Error("INVALID_OUTBOX_WORKER_BATCH_SIZE");
    }

    if (
      !Number.isInteger(this.pollIntervalMs) ||
      this.pollIntervalMs < 100
    ) {
      throw new Error("INVALID_OUTBOX_POLL_INTERVAL");
    }
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }

    await this.publisher.close();
  }

  async runOnce(): Promise<void> {
    const events = await this.outbox.claimBatch(this.batchSize);

    for (const record of events) {
      await this.processRecord(record);
    }
  }

  private async processRecord(record: ClaimedOutboxEvent): Promise<void> {
    try {
      if (!isRepositoryEvent(record.payload)) {
        throw new Error("INVALID_OUTBOX_EVENT_PAYLOAD");
      }

      await this.publisher.publish(record.payload);
      await this.outbox.markPublished(record.id);
    } catch (error) {
      this.onError("Failed to publish repository outbox event", error);

      try {
        await this.outbox.scheduleRetry(record.id, error);
      } catch (retryError) {
        // Keep the record recoverable by lease expiry if retry bookkeeping fails.
        this.onError("Failed to update outbox retry state", retryError);
      }
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.runOnce();
      } catch (error) {
        this.onError("Outbox polling failed", error);
      }

      if (this.running) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.pollIntervalMs);
        });
      }
    }
  }
}
