
import {
  getNextWorkflowStage,
  isTerminalWorkflowStatus,
  type WorkflowStage,
  type WorkflowStatus,
} from "./workflow-state.js";

export interface CreateWorkflowInput {
  readonly repositoryId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly headCommit?: string | null;
  readonly correlationId: string;
  readonly traceId: string;
  readonly createdAt?: Date;
}

export interface WorkflowFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly occurredAt: Date;
}

export interface WorkflowSnapshot {
  readonly id: string;
  readonly repositoryId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly headCommit: string | null;
  readonly correlationId: string;
  readonly traceId: string;
  readonly status: WorkflowStatus;
  readonly currentStage: WorkflowStage;
  readonly stageAttempt: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly nextAttemptAt: Date | null;
  readonly lastFailure: WorkflowFailure | null;
}

export class WorkflowDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "WorkflowDomainError";
  }
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new WorkflowDomainError(
      `${field} must not be empty.`,
      "INVALID_WORKFLOW_INPUT",
    );
  }

  return normalized;
}

function requireValidDate(value: Date, field: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new WorkflowDomainError(
      `${field} must be a valid date.`,
      "INVALID_WORKFLOW_DATE",
    );
  }

  return new Date(value.getTime());
}

function copyDate(value: Date | null): Date | null {
  return value ? new Date(value.getTime()) : null;
}

function copyFailure(
  value: WorkflowFailure | null,
): WorkflowFailure | null {
  if (!value) {
    return null;
  }

  return {
    ...value,
    occurredAt: new Date(value.occurredAt.getTime()),
  };
}

export class Workflow {
  private constructor(private state: WorkflowSnapshot) {}

  static create(
    input: CreateWorkflowInput,
    id: string,
  ): Workflow {
    const createdAt = requireValidDate(
      input.createdAt ?? new Date(),
      "createdAt",
    );

    const normalizedId = requireNonEmpty(id, "id");

    const snapshot: WorkflowSnapshot = {
      id: normalizedId,
      repositoryId: requireNonEmpty(input.repositoryId, "repositoryId"),
      projectId: requireNonEmpty(input.projectId, "projectId"),
      ownerId: requireNonEmpty(input.ownerId, "ownerId"),
      headCommit:
        input.headCommit == null
          ? null
          : requireNonEmpty(input.headCommit, "headCommit"),
      correlationId: requireNonEmpty(input.correlationId, "correlationId"),
      traceId: requireNonEmpty(input.traceId, "traceId"),
      status: "PENDING",
      currentStage: "REPOSITORY_SYNC",
      stageAttempt: 0,
      createdAt,
      updatedAt: createdAt,
      startedAt: null,
      completedAt: null,
      nextAttemptAt: null,
      lastFailure: null,
    };

    return new Workflow(snapshot);
  }

  static rehydrate(snapshot: WorkflowSnapshot): Workflow {
    if (!snapshot.id.trim()) {
      throw new WorkflowDomainError(
        "Workflow id must not be empty.",
        "INVALID_WORKFLOW_INPUT",
      );
    }

    if (
      !Number.isInteger(snapshot.stageAttempt) ||
      snapshot.stageAttempt < 0
    ) {
      throw new WorkflowDomainError(
        "stageAttempt must be a non-negative integer.",
        "INVALID_WORKFLOW_ATTEMPT",
      );
    }

    return new Workflow({
      ...snapshot,
      createdAt: requireValidDate(snapshot.createdAt, "createdAt"),
      updatedAt: requireValidDate(snapshot.updatedAt, "updatedAt"),
      startedAt: snapshot.startedAt
        ? requireValidDate(snapshot.startedAt, "startedAt")
        : null,
      completedAt: snapshot.completedAt
        ? requireValidDate(snapshot.completedAt, "completedAt")
        : null,
      nextAttemptAt: snapshot.nextAttemptAt
        ? requireValidDate(snapshot.nextAttemptAt, "nextAttemptAt")
        : null,
      lastFailure: copyFailure(snapshot.lastFailure),
    });
  }

  getSnapshot(): WorkflowSnapshot {
    return {
      ...this.state,
      createdAt: new Date(this.state.createdAt.getTime()),
      updatedAt: new Date(this.state.updatedAt.getTime()),
      startedAt: copyDate(this.state.startedAt),
      completedAt: copyDate(this.state.completedAt),
      nextAttemptAt: copyDate(this.state.nextAttemptAt),
      lastFailure: copyFailure(this.state.lastFailure),
    };
  }

  start(at: Date = new Date()): void {
    this.assertStatus("PENDING");

    const timestamp = requireValidDate(at, "at");

    this.state = {
      ...this.state,
      status: "RUNNING",
      startedAt: timestamp,
      updatedAt: timestamp,
    };
  }

  synchronize(headCommit: string, at: Date = new Date()): void {
    this.assertStatus("RUNNING");
    this.assertCurrentStage("REPOSITORY_SYNC");

    const normalizedCommit = requireNonEmpty(headCommit, "headCommit");
    const timestamp = requireValidDate(at, "at");

    this.state = {
      ...this.state,
      headCommit: normalizedCommit,
    };

    this.completeStage("REPOSITORY_SYNC", timestamp);
  }

  completeStage(stage: WorkflowStage, at: Date = new Date()): void {
    this.assertStatus("RUNNING");
    this.assertCurrentStage(stage);

    const timestamp = requireValidDate(at, "at");
    const nextStage = getNextWorkflowStage(stage);

    this.state = {
      ...this.state,
      status: nextStage ? "RUNNING" : "COMPLETED",
      currentStage: nextStage ?? stage,
      stageAttempt: 0,
      updatedAt: timestamp,
      completedAt: nextStage ? null : timestamp,
      nextAttemptAt: null,
      lastFailure: null,
    };
  }

  recordFailure(
    failure: WorkflowFailure,
    nextAttemptAt?: Date,
  ): void {
    this.assertStatus("RUNNING");
    this.assertCurrentStageFailure(failure);

    const occurredAt = requireValidDate(
      failure.occurredAt,
      "failure.occurredAt",
    );

    const retryAt = nextAttemptAt
      ? requireValidDate(nextAttemptAt, "nextAttemptAt")
      : null;

    if (failure.retryable && !retryAt) {
      throw new WorkflowDomainError(
        "A retryable failure requires nextAttemptAt.",
        "RETRY_SCHEDULE_REQUIRED",
      );
    }

    if (!failure.retryable && retryAt) {
      throw new WorkflowDomainError(
        "A non-retryable failure cannot have nextAttemptAt.",
        "UNEXPECTED_RETRY_SCHEDULE",
      );
    }

    if (retryAt && retryAt.getTime() <= occurredAt.getTime()) {
      throw new WorkflowDomainError(
        "nextAttemptAt must be later than the failure time.",
        "INVALID_RETRY_SCHEDULE",
      );
    }

    this.state = {
      ...this.state,
      status: failure.retryable ? "RETRY_WAIT" : "FAILED",
      updatedAt: occurredAt,
      completedAt: null,
      nextAttemptAt: retryAt,
      lastFailure: {
        ...failure,
        code: requireNonEmpty(failure.code, "failure.code"),
        message: requireNonEmpty(failure.message, "failure.message"),
        occurredAt,
      },
    };
  }

  resumeRetry(at: Date = new Date()): void {
    this.assertStatus("RETRY_WAIT");

    const timestamp = requireValidDate(at, "at");
    const retryAt = this.state.nextAttemptAt;

    if (!retryAt) {
      throw new WorkflowDomainError(
        "Retry-wait workflow has no scheduled retry time.",
        "RETRY_SCHEDULE_MISSING",
      );
    }

    if (timestamp.getTime() < retryAt.getTime()) {
      throw new WorkflowDomainError(
        "Workflow retry is not due yet.",
        "RETRY_NOT_DUE",
      );
    }

    this.state = {
      ...this.state,
      status: "RUNNING",
      stageAttempt: this.state.stageAttempt + 1,
      updatedAt: timestamp,
      nextAttemptAt: null,
    };
  }

  cancel(at: Date = new Date()): void {
    if (isTerminalWorkflowStatus(this.state.status)) {
      throw new WorkflowDomainError(
        `Cannot cancel a workflow in ${this.state.status} status.`,
        "INVALID_WORKFLOW_TRANSITION",
      );
    }

    const timestamp = requireValidDate(at, "at");

    this.state = {
      ...this.state,
      status: "CANCELLED",
      updatedAt: timestamp,
      completedAt: null,
      nextAttemptAt: null,
    };
  }

  private assertStatus(expected: WorkflowStatus): void {
    if (this.state.status !== expected) {
      throw new WorkflowDomainError(
        `Expected workflow status ${expected}, received ${this.state.status}.`,
        "INVALID_WORKFLOW_TRANSITION",
      );
    }
  }

  private assertCurrentStage(stage: WorkflowStage): void {
    if (this.state.currentStage !== stage) {
      throw new WorkflowDomainError(
        `Expected stage ${this.state.currentStage}, received ${stage}.`,
        "UNEXPECTED_WORKFLOW_STAGE",
      );
    }
  }

  private assertCurrentStageFailure(failure: WorkflowFailure): void {
    if (!failure.code.trim() || !failure.message.trim()) {
      throw new WorkflowDomainError(
        "Failure code and message must not be empty.",
        "INVALID_WORKFLOW_FAILURE",
      );
    }
  }
}
