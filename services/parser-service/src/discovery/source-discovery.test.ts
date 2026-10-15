import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverRepositorySources } from "./source-discovery.js";

const execFileAsync = promisify(execFile);

describe("discoverRepositorySources", () => {
  let repositoryRoot: string;

  beforeEach(async () => {
    repositoryRoot = await mkdtemp(
      path.join(os.tmpdir(), "forgemind-parser-"),
    );

    await execFileAsync("git", ["init", "-q"], {
      cwd: repositoryRoot,
    });

    await writeFile(
      path.join(repositoryRoot, ".gitignore"),
      "ignored.ts\nnode_modules/\n",
    );

    await mkdir(path.join(repositoryRoot, "src"), {
      recursive: true,
    });

    await mkdir(
      path.join(repositoryRoot, "node_modules", "dependency"),
      { recursive: true },
    );

    await writeFile(
      path.join(repositoryRoot, "src", "main.ts"),
      "export const main = true;\n",
    );

    await writeFile(
      path.join(repositoryRoot, "src", "large.ts"),
      "export const large = true;\n",
    );

    await writeFile(
      path.join(repositoryRoot, "src", "binary.ts"),
      Buffer.from([0, 1, 2, 3]),
    );

    await writeFile(
      path.join(repositoryRoot, "ignored.ts"),
      "export const ignored = true;\n",
    );

    await writeFile(
      path.join(repositoryRoot, "node_modules", "dependency", "index.ts"),
      "export const dependency = true;\n",
    );

    await execFileAsync("git", ["add", "-A"], {
      cwd: repositoryRoot,
    });

    // Untracked but not ignored: it must be discovered.
    await writeFile(
      path.join(repositoryRoot, "src", "untracked.py"),
      "print('hello')\n",
    );
  });

  afterEach(async () => {
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  it("discovers supported tracked and non-ignored untracked source files", async () => {
    const result = await discoverRepositorySources(repositoryRoot);

    expect(result.files.map((file) => file.path)).toEqual([
      "src/large.ts",
      "src/main.ts",
      "src/untracked.py",
    ]);

    expect(result.files.map((file) => file.languageId)).toEqual([
      "typescript",
      "typescript",
      "python",
    ]);

    expect(result.files.every((file) => !path.isAbsolute(file.path))).toBe(true);
    expect(result.skippedCounts["binary-content"]).toBe(1);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  it("does not include ignored or dependency-directory files", async () => {
    const result = await discoverRepositorySources(repositoryRoot);
    const paths = result.files.map((file) => file.path);

    expect(paths).not.toContain("ignored.ts");
    expect(paths).not.toContain("node_modules/dependency/index.ts");
  });

  it("enforces per-file size limits", async () => {
    const result = await discoverRepositorySources(repositoryRoot, {
      maxFileSizeBytes: 5,
    });

    expect(result.files).toEqual([]);
    expect(result.skippedCounts["file-too-large"]).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it("enforces the total source-byte limit", async () => {
    const result = await discoverRepositorySources(repositoryRoot, {
      maxTotalBytes: 1,
    });

    expect(result.files).toHaveLength(0);
    expect(result.skippedCounts["total-size-limit"]).toBeGreaterThan(0);
    expect(result.truncated).toBe(true);
  });

  it("rejects a directory that is not the repository root", async () => {
    const nestedDirectory = path.join(repositoryRoot, "src");

    await expect(
      discoverRepositorySources(nestedDirectory),
    ).rejects.toThrow("REPOSITORY_ROOT_MUST_BE_GIT_ROOT");
  });

  it("rejects invalid resource limits", async () => {
    await expect(
      discoverRepositorySources(repositoryRoot, {
        maxFiles: 0,
      }),
    ).rejects.toThrow("INVALID_SOURCE_DISCOVERY_OPTION_maxFiles");
  });
});