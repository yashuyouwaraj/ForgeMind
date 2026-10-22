
-- Permit workflow creation before the repository has been synchronized.
ALTER TABLE "workflow"."workflow_executions"
  ALTER COLUMN "headCommit" DROP NOT NULL;

-- Durable consumer inbox. A unique eventId makes duplicate delivery detectable.
CREATE TABLE "workflow"."workflow_inbox_events" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    CONSTRAINT "workflow_inbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_inbox_events_eventId_key"
  ON "workflow"."workflow_inbox_events"("eventId");

CREATE INDEX "workflow_inbox_events_processedAt_receivedAt_idx"
  ON "workflow"."workflow_inbox_events"("processedAt", "receivedAt");

-- Durable publisher outbox. Publishing is retried independently of event handling.
CREATE TABLE "workflow"."workflow_outbox_events" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leasedUntil" TIMESTAMPTZ(3),
    "deadLetteredAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    CONSTRAINT "workflow_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_outbox_events_eventId_key"
  ON "workflow"."workflow_outbox_events"("eventId");

CREATE INDEX "workflow_outbox_events_publishedAt_nextAttemptAt_idx"
  ON "workflow"."workflow_outbox_events"("publishedAt", "nextAttemptAt");

CREATE INDEX "workflow_outbox_events_leasedUntil_idx"
  ON "workflow"."workflow_outbox_events"("leasedUntil");
