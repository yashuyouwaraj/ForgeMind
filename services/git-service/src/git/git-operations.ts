
import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import {
  normalizeRepositoryUrl,
  validateRepositoryUrl,
} from "./repository-url.js";

export interface GitOperationResult {
  repositoryId: string;
  workspacePath: string;
  remoteUrl: string;
  branch: string;
  headCommit: string;
  completedAt: string;
}

export interface GitOperationsOptions {
  workspaceRoot?: string;
  cloneTimeoutMs?: number;
  commandTimeoutMs?: number;
  maxConcurrentOperations?: number;
}


class KeyedOperationLock {
  private readonly pending = new Map<string, Promise<void>>();

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.pending.set(key, current);

    await previous;

    try {
      return await operation();
    } finally {
      release();

      if (this.pending.get(key) === current) {
        this.pending.delete(key);
      }
    }
  }
}


class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error("INVALID_MAX_CONCURRENT_OPERATIONS");
    }
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    } else {
      this.active += 1;
    }

    try {
      return await operation();
    } finally {
      const next = this.waiters.shift();

      if (next) {
        next(); // Transfer the active slot to the next waiter.
      } else {
        this.active -= 1;
      }
    }
  }
}


export class GitOperations {
  private readonly workspaceRoot: string;
  private readonly cloneTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private readonly limiter: ConcurrencyLimiter;
  private readonly repositoryLock = new KeyedOperationLock();

  constructor(options: GitOperationsOptions = {}) {
    this.workspaceRoot = path.resolve(
      options.workspaceRoot ??
        process.env.GIT_WORKSPACE_ROOT ??
        path.join(process.cwd(), ".data", "git-workspaces"),
    );

    this.cloneTimeoutMs = options.cloneTimeoutMs ?? 120_000;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 30_000;
    this.limiter = new ConcurrencyLimiter(
      options.maxConcurrentOperations ?? 2,
    );

    if (
      this.cloneTimeoutMs < 1 ||
      this.commandTimeoutMs < 1
    ) {
      throw new Error("INVALID_GIT_OPERATION_TIMEOUT");
    }
  }

  async cloneRepository(
    repositoryId: string,
    remoteUrl: string,
  ): Promise<GitOperationResult> {
    const validatedUrl = validateRepositoryUrl(remoteUrl);
    const targetPath = this.getWorkspacePath(repositoryId);

    return this.repositoryLock.run(repositoryId, () =>
  this.limiter.run(async () => {
      await mkdir(this.workspaceRoot, { recursive: true });

      if (await this.pathExists(targetPath)) {
        throw new Error("REPOSITORY_WORKSPACE_ALREADY_EXISTS");
      }

      const stagingPath = path.join(
        this.workspaceRoot,
        `${repositoryId}.staging-${randomUUID()}`,
      );

      let published = false;

      try {
        const git = simpleGit({
          baseDir: this.workspaceRoot,
          timeout: { block: this.cloneTimeoutMs },
          maxConcurrentProcesses: 1,
        });

        await git.clone(validatedUrl, stagingPath);

        // Publish the workspace only after the clone completes.
        await rename(stagingPath, targetPath);
        published = true;

        return await this.getResult(
          repositoryId,
          targetPath,
          validatedUrl,
          this.commandTimeoutMs,
        );
      } catch (error) {
        await rm(stagingPath, { recursive: true, force: true });

        if (published) {
          await rm(targetPath, { recursive: true, force: true });
        }

        throw error;
      }
    }));
  }

  async synchronizeRepository(
    repositoryId: string,
    remoteUrl: string,
  ): Promise<GitOperationResult> {
    const validatedUrl = validateRepositoryUrl(remoteUrl);
    const targetPath = this.getWorkspacePath(repositoryId);

    return this.repositoryLock.run(repositoryId, () =>
  this.limiter.run(async () => {
      if (!(await this.pathExists(targetPath))) {
        throw new Error("REPOSITORY_WORKSPACE_NOT_FOUND");
      }

      const git = this.createGit(targetPath, this.commandTimeoutMs);

      const configuredRemote = String(
        await git.remote(["get-url", "origin"]),
      ).trim();

      if (
        normalizeRepositoryUrl(configuredRemote) !==
        normalizeRepositoryUrl(validatedUrl)
      ) {
        throw new Error("REPOSITORY_REMOTE_MISMATCH");
      }

      const status = await git.status();

      if (!status.isClean()) {
        throw new Error("REPOSITORY_WORKSPACE_DIRTY");
      }

      const branch = String(
        await git.revparse(["--abbrev-ref", "HEAD"]),
      ).trim();

      if (!branch || branch === "HEAD") {
        throw new Error("REPOSITORY_DETACHED_HEAD");
      }

      await git.fetch("origin");
      await git.pull("origin", branch, ["--ff-only"]);

      return this.getResult(
        repositoryId,
        targetPath,
        validatedUrl,
        this.commandTimeoutMs,
      );
    }));
  }

  private createGit(
    workspacePath: string,
    timeoutMs: number,
  ): SimpleGit {
    return simpleGit({
      baseDir: workspacePath,
      timeout: { block: timeoutMs },
      maxConcurrentProcesses: 1,
    });
  }

  private async getResult(
    repositoryId: string,
    workspacePath: string,
    remoteUrl: string,
    timeoutMs: number,
  ): Promise<GitOperationResult> {
    const git = this.createGit(workspacePath, timeoutMs);

    const [branch, headCommit] = await Promise.all([
      git.revparse(["--abbrev-ref", "HEAD"]),
      git.revparse(["HEAD"]),
    ]);

    return {
      repositoryId,
      workspacePath,
      remoteUrl,
      branch: branch.trim(),
      headCommit: headCommit.trim(),
      completedAt: new Date().toISOString(),
    };
  }

  private getWorkspacePath(repositoryId: string): string {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(repositoryId) ||
      repositoryId === "." ||
      repositoryId === ".."
    ) {
      throw new Error("INVALID_REPOSITORY_ID");
    }

    const workspacePath = path.resolve(
      this.workspaceRoot,
      repositoryId,
    );

    if (!workspacePath.startsWith(`${this.workspaceRoot}${path.sep}`)) {
      throw new Error("INVALID_WORKSPACE_PATH");
    }

    return workspacePath;
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
