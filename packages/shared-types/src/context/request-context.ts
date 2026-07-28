export interface RequestContext {
  requestId: string;
  correlationId: string;
  traceId: string;

  service: string;

  startTime: number;

  userId?: string;

  workspaceId?: string;

  repositoryId?: string;

  jobId?: string;
}