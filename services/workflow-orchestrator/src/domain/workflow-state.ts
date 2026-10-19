
export const WORKFLOW_STATUSES = [
  "PENDING",
  "RUNNING",
  "RETRY_WAIT",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_STAGES = [
  "REPOSITORY_SYNC",
  "REPOSITORY_PARSE",
  "SEMANTIC_ANALYSIS",
  "UIR_GENERATION",
  "KNOWLEDGE_GRAPH_UPDATE",
  "DIGITAL_TWIN_UPDATE",
  "IMPACT_ANALYSIS",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const TERMINAL_WORKFLOW_STATUSES: ReadonlySet<WorkflowStatus> =
  new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export function isTerminalWorkflowStatus(
  status: WorkflowStatus,
): boolean {
  return TERMINAL_WORKFLOW_STATUSES.has(status);
}

export function getNextWorkflowStage(
  currentStage: WorkflowStage,
): WorkflowStage | null {
  const currentIndex = WORKFLOW_STAGES.indexOf(currentStage);

  if (currentIndex < 0 || currentIndex === WORKFLOW_STAGES.length - 1) {
    return null;
  }

  return WORKFLOW_STAGES[currentIndex + 1] ?? null;
}
