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
  operationTimeoutMs?: number;
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

function assertOperationWithinDeadline(deadlineExceeded: boolean): void {
  if (deadlineExceeded) {
    throw new Error("GIT_OPERATION_TIMEOUT");
  }
}

export class GitOperations {
  private readonly workspaceRoot: string;
  private readonly cloneTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private readonly operationTimeoutMs: number;
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
    this.operationTimeoutMs = options.operationTimeoutMs ?? 300_000;
    this.limiter = new ConcurrencyLimiter(options.maxConcurrentOperations ?? 2);
    if (
      !Number.isFinite(this.cloneTimeoutMs) ||
      this.cloneTimeoutMs < 1 ||
      !Number.isFinite(this.commandTimeoutMs) ||
      this.commandTimeoutMs < 1 ||
      !Number.isFinite(this.operationTimeoutMs) ||
      this.operationTimeoutMs < 1
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
        const controller = new AbortController();
        let deadlineExceeded = false;

        const deadlineTimer = setTimeout(() => {
          deadlineExceeded = true;
          controller.abort();
        }, this.operationTimeoutMs);

        const stagingPath = path.join(
          this.workspaceRoot,
          `${repositoryId}.staging-${randomUUID()}`,
        );

        let published = false;

        try {
          await mkdir(this.workspaceRoot, { recursive: true });

          if (await this.pathExists(targetPath)) {
            throw new Error("REPOSITORY_WORKSPACE_ALREADY_EXISTS");
          }

          const git = simpleGit({
            baseDir: this.workspaceRoot,
            timeout: { block: this.cloneTimeoutMs },
            maxConcurrentProcesses: 1,
            abort: controller.signal,
          });

          await git.clone(validatedUrl, stagingPath);

          assertOperationWithinDeadline(deadlineExceeded);

          // Publish the workspace only after the clone completes.
          await rename(stagingPath, targetPath);
          published = true;

          const result = await this.getResult(
            repositoryId,
            targetPath,
            validatedUrl,
            this.commandTimeoutMs,
            controller.signal,
          );

          assertOperationWithinDeadline(deadlineExceeded);

          return result;
        } catch (error) {
          const timedOut = deadlineExceeded;

          await rm(stagingPath, {
            recursive: true,
            force: true,
            maxRetries: 20,
            retryDelay: 100,
          });

          if (published) {
            await rm(targetPath, {
              recursive: true,
              force: true,
              maxRetries: 20,
              retryDelay: 100,
            });
          }

          if (timedOut) {
            throw new Error("GIT_OPERATION_TIMEOUT");
          }

          throw error;
        } finally {
          clearTimeout(deadlineTimer);
        }
      }),
    );
  }

  async synchronizeRepository(
    repositoryId: string,
    remoteUrl: string,
  ): Promise<GitOperationResult> {
    const validatedUrl = validateRepositoryUrl(remoteUrl);
    const targetPath = this.getWorkspacePath(repositoryId);

    return this.repositoryLock.run(repositoryId, () =>
      this.limiter.run(async () => {
        const controller = new AbortController();
        let deadlineExceeded = false;

        const deadlineTimer = setTimeout(() => {
          deadlineExceeded = true;
          controller.abort();
        }, this.operationTimeoutMs);

        try {
          if (!(await this.pathExists(targetPath))) {
            throw new Error("REPOSITORY_WORKSPACE_NOT_FOUND");
          }

          const git = this.createGit(
            targetPath,
            this.commandTimeoutMs,
            controller.signal,
          );

          const configuredRemote = String(
            await git.raw(["config", "--get", "remote.origin.url"]),
          ).trim();
          assertOperationWithinDeadline(deadlineExceeded);

          if (
            normalizeRepositoryUrl(configuredRemote) !==
            normalizeRepositoryUrl(validatedUrl)
          ) {
            throw new Error("REPOSITORY_REMOTE_MISMATCH");
          }

          const status = await git.status();
          assertOperationWithinDeadline(deadlineExceeded);

          if (!status.isClean()) {
            throw new Error("REPOSITORY_WORKSPACE_DIRTY");
          }

          const branch = String(
            await git.revparse(["--abbrev-ref", "HEAD"]),
          ).trim();
          assertOperationWithinDeadline(deadlineExceeded);

          if (!branch || branch === "HEAD") {
            throw new Error("REPOSITORY_DETACHED_HEAD");
          }

          await git.fetch("origin");
          assertOperationWithinDeadline(deadlineExceeded);

          await git.pull("origin", branch, ["--ff-only"]);
          assertOperationWithinDeadline(deadlineExceeded);

          const result = await this.getResult(
            repositoryId,
            targetPath,
            validatedUrl,
            this.commandTimeoutMs,
            controller.signal,
          );

          assertOperationWithinDeadline(deadlineExceeded);

          return result;
        } catch (error) {
          if (deadlineExceeded) {
            throw new Error("GIT_OPERATION_TIMEOUT");
          }

          throw error;
        } finally {
          clearTimeout(deadlineTimer);
        }
      }),
    );
  }

  private createGit(
    workspacePath: string,
    timeoutMs: number,
    abortSignal: AbortSignal,
  ): SimpleGit {
    return simpleGit({
      baseDir: workspacePath,
      timeout: { block: timeoutMs },
      maxConcurrentProcesses: 1,
      abort: abortSignal,
    });
  }

  private async getResult(
    repositoryId: string,
    workspacePath: string,
    remoteUrl: string,
    timeoutMs: number,
    abortSignal: AbortSignal,
  ): Promise<GitOperationResult> {
    const git = this.createGit(workspacePath, timeoutMs, abortSignal);

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

    const workspacePath = path.resolve(this.workspaceRoot, repositoryId);

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
