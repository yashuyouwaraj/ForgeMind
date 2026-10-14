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

  it("continues queued operations after an earlier clone fails", async () => {
    const started: string[] = [];
    let releaseFirst!: () => void;

    const firstCloneGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    gitMocks.clone.mockImplementation(
      async (_url: string, destination: string) => {
        const repositoryName = path.basename(destination).split(".staging-")[0];

        started.push(repositoryName);

        if (repositoryName === "repo-first") {
          await firstCloneGate;
          throw new Error("FIRST_CLONE_FAILED");
        }

        await mkdir(destination, { recursive: true });
      },
    );

    const operations = new GitOperations({
      workspaceRoot,
      maxConcurrentOperations: 1,
    });

    const first = operations.cloneRepository("repo-first", remoteUrl);
    const second = operations.cloneRepository("repo-second", remoteUrl);
    const third = operations.cloneRepository("repo-third", remoteUrl);

    // Allow the first clone to enter its mocked operation.
    await vi.waitFor(() => {
      expect(started).toEqual(["repo-first"]);
    });

    releaseFirst();

    const results = await Promise.allSettled([first, second, third]);

    expect(results[0]?.status).toBe("rejected");
    expect(results[1]?.status).toBe("fulfilled");
    expect(results[2]?.status).toBe("fulfilled");

    expect(started).toEqual(["repo-first", "repo-second", "repo-third"]);
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

  it("does not pull when fetching the remote fails", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));

    gitMocks.fetch.mockRejectedValue(new Error("FETCH_FAILED"));

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("FETCH_FAILED");

    expect(gitMocks.fetch).toHaveBeenCalledWith("origin");
    expect(gitMocks.pull).not.toHaveBeenCalled();
  });

  it("does not report success when a fast-forward pull fails", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));

    gitMocks.pull.mockRejectedValue(new Error("PULL_FAILED"));

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("PULL_FAILED");

    expect(gitMocks.fetch).toHaveBeenCalledWith("origin");
    expect(gitMocks.pull).toHaveBeenCalledWith("origin", "main", ["--ff-only"]);
    expect(gitMocks.revparse).not.toHaveBeenCalledWith(["HEAD"]);
  });

  it("recovers on a subsequent synchronization after fetch fails", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));
    gitMocks.fetch.mockRejectedValueOnce(new Error("FETCH_FAILED"));

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("FETCH_FAILED");

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).resolves.toMatchObject({
      repositoryId,
      branch: "main",
      headCommit: "a".repeat(40),
    });

    expect(gitMocks.fetch).toHaveBeenCalledTimes(2);
    expect(gitMocks.pull).toHaveBeenCalledTimes(1);
  });

  it("recovers on a subsequent synchronization after pull fails", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));
    gitMocks.pull.mockRejectedValueOnce(new Error("PULL_FAILED"));

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("PULL_FAILED");

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).resolves.toMatchObject({
      repositoryId,
      branch: "main",
      headCommit: "a".repeat(40),
    });

    expect(gitMocks.fetch).toHaveBeenCalledTimes(2);
    expect(gitMocks.pull).toHaveBeenCalledTimes(2);
  });

  it("allows a queued synchronization after an earlier fetch fails", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));

    let fetchAttempts = 0;
    let releaseFirstFetch!: () => void;

    const firstFetchGate = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });

    gitMocks.fetch.mockImplementation(async () => {
      fetchAttempts += 1;

      if (fetchAttempts === 1) {
        await firstFetchGate;
        throw new Error("FETCH_FAILED");
      }
    });

    const operations = new GitOperations({ workspaceRoot });

    const first = operations.synchronizeRepository(repositoryId, remoteUrl);

    await vi.waitFor(() => {
      expect(fetchAttempts).toBe(1);
    });

    const second = operations.synchronizeRepository(repositoryId, remoteUrl);

    releaseFirstFetch();

    const results = await Promise.allSettled([first, second]);

    expect(results[0]?.status).toBe("rejected");
    expect(results[1]?.status).toBe("fulfilled");
    expect(fetchAttempts).toBe(2);
    expect(gitMocks.pull).toHaveBeenCalledTimes(1);
  });

  it("allows a queued synchronization after an earlier pull fails", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));

    let pullAttempts = 0;
    let releaseFirstPull!: () => void;

    const firstPullGate = new Promise<void>((resolve) => {
      releaseFirstPull = resolve;
    });

    gitMocks.pull.mockImplementation(async () => {
      pullAttempts += 1;

      if (pullAttempts === 1) {
        await firstPullGate;
        throw new Error("PULL_FAILED");
      }
    });

    const operations = new GitOperations({ workspaceRoot });

    const first = operations.synchronizeRepository(repositoryId, remoteUrl);

    await vi.waitFor(() => {
      expect(pullAttempts).toBe(1);
    });

    const second = operations.synchronizeRepository(repositoryId, remoteUrl);

    releaseFirstPull();

    const results = await Promise.allSettled([first, second]);

    expect(results[0]?.status).toBe("rejected");
    expect(results[1]?.status).toBe("fulfilled");
    expect(pullAttempts).toBe(2);
    expect(gitMocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-positive clone timeout", () => {
    expect(
      () => new GitOperations({ workspaceRoot, cloneTimeoutMs: 0 }),
    ).toThrow("INVALID_GIT_OPERATION_TIMEOUT");
  });

  it("rejects a non-positive command timeout", () => {
    expect(
      () => new GitOperations({ workspaceRoot, commandTimeoutMs: 0 }),
    ).toThrow("INVALID_GIT_OPERATION_TIMEOUT");
  });

  it("rejects a non-positive concurrency limit", () => {
    expect(
      () => new GitOperations({ workspaceRoot, maxConcurrentOperations: 0 }),
    ).toThrow("INVALID_MAX_CONCURRENT_OPERATIONS");
  });

  it("rejects synchronization when the workspace does not exist", async () => {
    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("REPOSITORY_WORKSPACE_NOT_FOUND");

    expect(gitMocks.remote).not.toHaveBeenCalled();
    expect(gitMocks.fetch).not.toHaveBeenCalled();
    expect(gitMocks.pull).not.toHaveBeenCalled();
  });

  it("rejects an invalid repository ID before invoking Git", async () => {
    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.cloneRepository("../invalid", remoteUrl),
    ).rejects.toThrow("INVALID_REPOSITORY_ID");

    expect(gitMocks.clone).not.toHaveBeenCalled();
  });

  it("passes the configured timeout to clone operations", async () => {
    const operations = new GitOperations({
      workspaceRoot,
      cloneTimeoutMs: 5_000,
    });

    await operations.cloneRepository(repositoryId, remoteUrl);

    const { simpleGit } = await import("simple-git");

    expect(simpleGit).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: { block: 5_000 },
        maxConcurrentProcesses: 1,
      }),
    );
  });

  it("passes the configured command timeout to synchronization", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));

    const operations = new GitOperations({
      workspaceRoot,
      commandTimeoutMs: 7_000,
    });

    await operations.synchronizeRepository(repositoryId, remoteUrl);

    const { simpleGit } = await import("simple-git");

    expect(simpleGit).toHaveBeenCalledWith(
      expect.objectContaining({
        baseDir: path.join(workspaceRoot, repositoryId),
        timeout: { block: 7_000 },
        maxConcurrentProcesses: 1,
      }),
    );
  });

  it("preserves other workspaces when a clone fails", async () => {
    await mkdir(path.join(workspaceRoot, "repo-existing"));
    gitMocks.clone.mockRejectedValueOnce(new Error("CLONE_TIMEOUT"));

    const operations = new GitOperations({ workspaceRoot });

    await expect(
      operations.cloneRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("CLONE_TIMEOUT");

    expect(await readdir(workspaceRoot)).toEqual(["repo-existing"]);
  });

  it("allows a clone retry after an earlier clone fails", async () => {
    gitMocks.clone.mockRejectedValueOnce(new Error("CLONE_TIMEOUT"));

    const operations = new GitOperations({
      workspaceRoot,
      maxConcurrentOperations: 1,
    });

    await expect(
      operations.cloneRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("CLONE_TIMEOUT");

    await expect(
      operations.cloneRepository(repositoryId, remoteUrl),
    ).resolves.toMatchObject({
      repositoryId,
      branch: "main",
      headCommit: "a".repeat(40),
    });

    expect(gitMocks.clone).toHaveBeenCalledTimes(2);
    expect(await readdir(workspaceRoot)).toEqual([repositoryId]);
  });

  it("releases the concurrency slot after synchronization fails", async () => {
    await mkdir(path.join(workspaceRoot, repositoryId));
    await mkdir(path.join(workspaceRoot, "repo-second"));

    gitMocks.fetch.mockRejectedValueOnce(new Error("FETCH_TIMEOUT"));

    const operations = new GitOperations({
      workspaceRoot,
      maxConcurrentOperations: 1,
    });

    await expect(
      operations.synchronizeRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("FETCH_TIMEOUT");

    await expect(
      operations.synchronizeRepository("repo-second", remoteUrl),
    ).resolves.toMatchObject({
      repositoryId: "repo-second",
      branch: "main",
    });

    expect(gitMocks.fetch).toHaveBeenCalledTimes(2);
  });
});
