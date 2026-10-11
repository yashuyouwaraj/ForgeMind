import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const gitMocks = vi.hoisted(() => ({
  clone: vi.fn(),
  remote: vi.fn(),
  status: vi.fn(),
  revparse: vi.fn(),
  fetch: vi.fn(),
  pull: vi.fn(),
}));

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => gitMocks),
}));

import { GitOperations } from "./git-operations.js";

const repositoryId = "repo-test";
const remoteUrl = "https://github.com/acme/forgemind.git";

let workspaceRoot: string;

describe("GitOperations", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    workspaceRoot = await mkdtemp(path.join(tmpdir(), "forgemind-git-test-"));

    gitMocks.clone.mockImplementation(
      async (_url: string, destination: string) => {
        await mkdir(destination, { recursive: true });
      },
    );

    gitMocks.remote.mockResolvedValue(remoteUrl);
    gitMocks.status.mockResolvedValue({
      isClean: () => true,
    });
    gitMocks.revparse.mockImplementation(async (args: string[]) =>
      args[0] === "--abbrev-ref" ? "main" : "a".repeat(40),
    );
    gitMocks.fetch.mockResolvedValue(undefined);
    gitMocks.pull.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("cleans up staging files when cloning fails", async () => {
    gitMocks.clone.mockRejectedValue(new Error("CLONE_FAILED"));

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.cloneRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("CLONE_FAILED");

    expect(await readdir(workspaceRoot)).toEqual([]);
  });

  it("removes the published workspace if result collection fails", async () => {
    gitMocks.revparse.mockRejectedValue(new Error("RESULT_COLLECTION_FAILED"));

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.cloneRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("RESULT_COLLECTION_FAILED");

    expect(await readdir(workspaceRoot)).toEqual([]);
  });

  it("does not overwrite an existing workspace", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.cloneRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("REPOSITORY_WORKSPACE_ALREADY_EXISTS");

    expect(gitMocks.clone).not.toHaveBeenCalled();
  });

  it("rejects a synchronization when the configured remote differs", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));
    gitMocks.remote.mockResolvedValue(
      "https://github.com/another-owner/another-repo.git",
    );

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("REPOSITORY_REMOTE_MISMATCH");

    expect(gitMocks.fetch).not.toHaveBeenCalled();
    expect(gitMocks.pull).not.toHaveBeenCalled();
  });

  it("rejects a dirty working tree before fetching or pulling", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));
    gitMocks.status.mockResolvedValue({
      isClean: () => false,
    });

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("REPOSITORY_WORKSPACE_DIRTY");

    expect(gitMocks.fetch).not.toHaveBeenCalled();
    expect(gitMocks.pull).not.toHaveBeenCalled();
  });

  it("rejects detached HEAD before fetching or pulling", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));
    gitMocks.revparse.mockResolvedValue("HEAD");

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("REPOSITORY_DETACHED_HEAD");

    expect(gitMocks.fetch).not.toHaveBeenCalled();
    expect(gitMocks.pull).not.toHaveBeenCalled();
  });

  it("releases its concurrency slot after a failed clone", async () => {
    let failFirstClone = true;

    gitMocks.clone.mockImplementation(
      async (_url: string, destination: string) => {
        if (failFirstClone) {
          failFirstClone = false;
          throw new Error("CLONE_FAILED");
        }

        await mkdir(destination, { recursive: true });
      },
    );

    const operations = new GitOperations({
      workspaceRoot,
      maxConcurrentOperations: 1,
    });

    await expect(
      operations.cloneRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("CLONE_FAILED");

    await expect(
      operations.cloneRepository(repositoryId, remoteUrl),
    ).resolves.toMatchObject({
      repositoryId,
      branch: "main",
      headCommit: "a".repeat(40),
    });

    expect(gitMocks.clone).toHaveBeenCalledTimes(2);
  });

  it("serializes simultaneous clone requests for the same repository", async () => {
    let cloneCount = 0;

    gitMocks.clone.mockImplementation(
      async (_url: string, destination: string) => {
        cloneCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        await mkdir(destination, { recursive: true });
      },
    );

    const operations = new GitOperations({
      workspaceRoot,
      maxConcurrentOperations: 2,
    });

    const results = await Promise.allSettled([
      operations.cloneRepository(repositoryId, remoteUrl),
      operations.cloneRepository(repositoryId, remoteUrl),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(cloneCount).toBe(1);
  });
});
