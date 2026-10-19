-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "workflow";

-- CreateEnum
CREATE TYPE "workflow"."WorkflowStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRY_WAIT', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "workflow"."WorkflowStage" AS ENUM ('REPOSITORY_SYNC', 'REPOSITORY_PARSE', 'SEMANTIC_ANALYSIS', 'UIR_GENERATION', 'KNOWLEDGE_GRAPH_UPDATE', 'DIGITAL_TWIN_UPDATE', 'IMPACT_ANALYSIS');

-- CreateTable
CREATE TABLE "workflow"."workflow_executions" (
    "id" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "headCommit" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "status" "workflow"."WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "currentStage" "workflow"."WorkflowStage" NOT NULL DEFAULT 'REPOSITORY_SYNC',
    "stageAttempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3),
    "lastFailureCode" TEXT,
    "lastFailureMessage" TEXT,
    "lastFailureRetryable" BOOLEAN,
    "lastFailureAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_executions_status_nextAttemptAt_idx" ON "workflow"."workflow_executions"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "workflow_executions_repositoryId_createdAt_idx" ON "workflow"."workflow_executions"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "workflow_executions_projectId_createdAt_idx" ON "workflow"."workflow_executions"("projectId", "createdAt");
