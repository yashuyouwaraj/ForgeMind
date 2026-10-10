import {
  InternalServerError,
  NotFoundError,
} from "@forgemind/shared-errors";

export class ProjectAccessClient {
  constructor(
    private readonly projectServiceUrl: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async assertProjectOwner(
    projectId: string,
    authorization: string,
  ): Promise<void> {
    const baseUrl = this.projectServiceUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/api/projects/${encodeURIComponent(projectId)}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: authorization,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new InternalServerError(
        "Unable to verify project ownership",
      );
    }

    if (response.status === 404) {
      // The existing Project Service deliberately hides projects
      // the requester is not authorized to access.
      throw new NotFoundError("Project not found");
    }

    if (!response.ok) {
      throw new InternalServerError(
        "Unable to verify project ownership",
      );
    }
  }
}