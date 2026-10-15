import { execFile } from "node:child_process";
import { open, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import type {
  SourceDiscoveryResult,
  SourceDiscoverySkipReason,
  SourceFileMetadata,
} from "../domain/source-file.js";
import {
  languageRegistry,
  type LanguageRegistry,
} from "../languages/language-registry.js";

export interface SourceDiscoveryOptions {
  readonly maxFiles: number;
  readonly maxFileSizeBytes: number;
  readonly maxTotalBytes: number;
  readonly maxDepth: number;
  readonly gitTimeoutMs: number;
  readonly maxFileListBytes: number;
}

const DEFAULT_OPTIONS: SourceDiscoveryOptions = {
  maxFiles: 20_000,
  maxFileSizeBytes: 1_048_576,
  maxTotalBytes: 52_428_800,
  maxDepth: 40,
  gitTimeoutMs: 15_000,
  maxFileListBytes: 32 * 1024 * 1024,
};

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "target",
  "bin",
  "obj",
  "__pycache__",
  ".venv",
  "venv",
  "generated",
]);

const SKIP_REASONS: readonly SourceDiscoverySkipReason[] = [
  "excluded-directory",
  "too-deep",
  "unsafe-path",
  "symlink",
  "not-regular-file",
  "file-too-large",
  "total-size-limit",
  "file-count-limit",
  "binary-content",
  "file-unavailable",
];

type GitError = Error & { code?: string };

function validateOptions(options: SourceDiscoveryOptions): void {
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`INVALID_SOURCE_DISCOVERY_OPTION_${name}`);
    }
  }
}

function executeGit(
  args: readonly string[],
  cwd: string,
  options: SourceDiscoveryOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        encoding: "utf8",
        windowsHide: true,
        timeout: options.gitTimeoutMs,
        maxBuffer: options.maxFileListBytes,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      },
    );
  });
}

function normalizePathForComparison(value: string): string {
  const resolved = path.resolve(value);

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function incrementSkip(
  counts: Record<SourceDiscoverySkipReason, number>,
  reason: SourceDiscoverySkipReason,
): void {
  counts[reason] += 1;
}

function isInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function toAbsolutePath(root: string, relativePath: string): string | null {
  if (
    relativePath.length === 0 ||
    relativePath.includes("\0") ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    return null;
  }

  const segments = relativePath.split("/");

  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return null;
  }

  const absolutePath = path.resolve(root, ...segments);

  return isInsideRoot(root, absolutePath) ? absolutePath : null;
}

function containsBinaryMarker(sample: Buffer): boolean {
  return sample.includes(0);
}

async function isBinaryFile(
  filePath: string,
  sizeBytes: number,
): Promise<boolean> {
  if (sizeBytes === 0) return false;

  const handle = await open(filePath, "r");

  try {
    const sample = Buffer.alloc(Math.min(sizeBytes, 8_192));
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);

    return containsBinaryMarker(sample.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function createSkipCounts(): Record<SourceDiscoverySkipReason, number> {
  return Object.fromEntries(
    SKIP_REASONS.map((reason) => [reason, 0]),
  ) as Record<SourceDiscoverySkipReason, number>;
}

function normalizeGitFailure(
  error: unknown,
  operation: "root" | "files",
): Error {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as GitError).code)
      : "";

  if (code === "ENOENT") {
    return new Error("GIT_EXECUTABLE_UNAVAILABLE");
  }

  if (code === "ETIMEDOUT") {
    return new Error("GIT_COMMAND_TIMEOUT");
  }

  if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return new Error("GIT_FILE_LIST_LIMIT_EXCEEDED");
  }

  return new Error(
    operation === "root"
      ? "INVALID_GIT_REPOSITORY_ROOT"
      : "SOURCE_DISCOVERY_GIT_FAILED",
  );
}

export interface SourceDiscoveryDependencies {
  readonly languageRegistry?: LanguageRegistry;
}

export async function discoverRepositorySources(
  repositoryRoot: string,
  overrides: Partial<SourceDiscoveryOptions> = {},
  dependencies: SourceDiscoveryDependencies = {},
): Promise<SourceDiscoveryResult> {
  const options: SourceDiscoveryOptions = {
    ...DEFAULT_OPTIONS,
    ...overrides,
  };

  validateOptions(options);

  const registry = dependencies.languageRegistry ?? languageRegistry;
  const root = await realpath(repositoryRoot);

  const rootInfo = await lstat(root);

  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("INVALID_GIT_REPOSITORY_ROOT");
  }

  let gitRoot: string;

  try {
    gitRoot = (
      await executeGit(["rev-parse", "--show-toplevel"], root, options)
    ).trim();
  } catch (error) {
    throw normalizeGitFailure(error, "root");
  }

  const canonicalGitRoot = await realpath(gitRoot);

  if (
    normalizePathForComparison(canonicalGitRoot) !==
    normalizePathForComparison(root)
  ) {
    throw new Error("REPOSITORY_ROOT_MUST_BE_GIT_ROOT");
  }

  let listing: string;

  try {
    listing = await executeGit(
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      root,
      options,
    );
  } catch (error) {
    throw normalizeGitFailure(error, "files");
  }

  const candidates = listing
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  const files: SourceFileMetadata[] = [];
  const skippedCounts = createSkipCounts();

  let totalBytes = 0;
  let truncated = false;

  for (const relativePath of candidates) {
    const segments = relativePath.split("/");
    const extension = path.posix.extname(relativePath).toLowerCase();

    // Ignore non-source files before touching their filesystem paths.
    const language = registry.detect(relativePath);
    if (!language) continue;

    if (
      segments.some((segment) =>
        EXCLUDED_DIRECTORIES.has(segment.toLowerCase()),
      )
    ) {
      incrementSkip(skippedCounts, "excluded-directory");
      continue;
    }

    if (segments.length > options.maxDepth) {
      incrementSkip(skippedCounts, "too-deep");
      continue;
    }

    const absolutePath = toAbsolutePath(root, relativePath);

    if (!absolutePath) {
      incrementSkip(skippedCounts, "unsafe-path");
      continue;
    }

    if (files.length >= options.maxFiles) {
      incrementSkip(skippedCounts, "file-count-limit");
      truncated = true;
      continue;
    }

    let metadata;

    try {
      metadata = await lstat(absolutePath);
    } catch {
      incrementSkip(skippedCounts, "file-unavailable");
      continue;
    }

    if (metadata.isSymbolicLink()) {
      incrementSkip(skippedCounts, "symlink");
      continue;
    }

    if (!metadata.isFile()) {
      incrementSkip(skippedCounts, "not-regular-file");
      continue;
    }

    if (metadata.size > options.maxFileSizeBytes) {
      incrementSkip(skippedCounts, "file-too-large");
      truncated = true;
      continue;
    }

    if (totalBytes + metadata.size > options.maxTotalBytes) {
      incrementSkip(skippedCounts, "total-size-limit");
      truncated = true;
      continue;
    }

    try {
      if (await isBinaryFile(absolutePath, metadata.size)) {
        incrementSkip(skippedCounts, "binary-content");
        continue;
      }
    } catch {
      incrementSkip(skippedCounts, "file-unavailable");
      continue;
    }

    files.push({
      path: relativePath,
      extension,
      languageId: language.id,
      sizeBytes: metadata.size,
    });

    totalBytes += metadata.size;
  }

  return {
    files,
    totalBytes,
    skippedCounts,
    truncated,
  };
}
