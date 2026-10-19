
import type { Workflow } from "./workflow.js";

export interface PersistedWorkflow {
  readonly workflow: Workflow;
  readonly version: number;
}

export interface WorkflowRepository {
  create(workflow: Workflow): Promise<PersistedWorkflow>;

  findById(id: string): Promise<PersistedWorkflow | null>;

  save(
    workflow: Workflow,
    expectedVersion: number,
  ): Promise<PersistedWorkflow>;
}

export class WorkflowNotFoundError extends Error {
  constructor(id: string) {
    super(`Workflow '${id}' was not found.`);
    this.name = "WorkflowNotFoundError";
  }
}

export class WorkflowConcurrencyError extends Error {
  constructor(id: string) {
    super(
      `Workflow '${id}' was modified by another operation. Reload it before retrying.`,
    );
    this.name = "WorkflowConcurrencyError";
  }
}
