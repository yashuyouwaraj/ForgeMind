
CREATE TABLE "repository"."event_outbox" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "deadLetteredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_outbox_eventId_key"
ON "repository"."event_outbox"("eventId");

CREATE INDEX "event_outbox_publishedAt_deadLetteredAt_nextAttemptAt_lockedUntil_idx"
ON "repository"."event_outbox"(
    "publishedAt",
    "deadLetteredAt",
    "nextAttemptAt",
    "lockedUntil"
);