
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NotFoundError,
  ServiceUnavailableError,
} from "@forgemind/shared-errors";
import { RepositoryAccessClient } from "./repository-access-client.js";

describe("RepositoryAccessClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns repository metadata from Repository Service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "repo-123",
            projectId: "project-456",
            url: "https://github.com/acme/engine.git",
            defaultBranch: "main",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new RepositoryAccessClient("http://localhost:3003");
    const result = await client.getAuthorizedRepository(
      "repo-123",
      "Bearer test-token",
    );

    expect(result).toEqual({
      id: "repo-123",
      projectId: "project-456",
      url: "https://github.com/acme/engine.git",
      defaultBranch: "main",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3003/api/repositories/repo-123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("rejects repositories that are missing or inaccessible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );

    const client = new RepositoryAccessClient("http://localhost:3003");

    await expect(
      client.getAuthorizedRepository("repo-123", "Bearer test-token"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fails closed when Repository Service is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Connection refused")),
    );

    const client = new RepositoryAccessClient("http://localhost:3003");

    await expect(
      client.getAuthorizedRepository("repo-123", "Bearer test-token"),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
