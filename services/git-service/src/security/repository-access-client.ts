import {
  InternalServerError,
  NotFoundError,
  ServiceUnavailableError,
} from "@forgemind/shared-errors";

interface RepositoryMetadata {
  id: string;
  projectId: string;
  url: string;
  defaultBranch: string | null;
}

export class RepositoryAccessClient {
  constructor(
    private readonly repositoryServiceUrl = process.env
      .REPOSITORY_SERVICE_URL ?? "http://localhost:3003",
    private readonly timeoutMs = 5_000,
  ) {}

  async getAuthorizedRepository(
    repositoryId: string,
    authorization: string,
  ): Promise<RepositoryMetadata> {
    const baseUrl = this.repositoryServiceUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/api/repositories/${encodeURIComponent(repositoryId)}`;

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
      throw new ServiceUnavailableError()
    }

    if (response.status === 404) {
      throw new NotFoundError("Repository not found")
    }

    if (!response.ok) {
      throw new InternalServerError("Unable to verify repository access")
    }

    const body: unknown = await response.json();

    if (
      typeof body !== "object" ||
      body === null ||
      !("data" in body) ||
      typeof body.data !== "object" ||
      body.data === null
    ) {
      throw new InternalServerError("Invalid repository service response")
    }

    const data = body.data as Record<string, unknown>;

    if (
      data.id !== repositoryId ||
      typeof data.projectId !== "string" ||
      typeof data.url !== "string" ||
      !(typeof data.defaultBranch === "string" || data.defaultBranch === null)
    ) {
      throw new InternalServerError("Invalid repository service response")
    }

    return {
      id: repositoryId,
      projectId: data.projectId,
      url: data.url,
      defaultBranch: data.defaultBranch,
    };
  }
}
