import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { GitOperations } from "./git-operations.js";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
let isolatedGitConfigPath: string | undefined;
const originalGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
const originalGitConfigNosystem = process.env.GIT_CONFIG_NOSYSTEM;
const originalGitTerminalPrompt = process.env.GIT_TERMINAL_PROMPT;

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: isolatedGitConfigPath,
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    return stdout.trim();
  } catch (error) {
    const gitError = error as Error & {
      stdout?: string;
      stderr?: string;
    };

    const details = [
      `Git command failed: git ${args.join(" ")}`,
      `Working directory: ${cwd}`,
      gitError.message,
      gitError.stdout?.trim(),
      gitError.stderr?.trim(),
    ].filter(Boolean);

    throw new Error(details.join("\n"), { cause: error });
  }
}

async function configureGitIdentity(cwd: string): Promise<void> {
  await runGit(cwd, ["config", "user.name", "ForgeMind Integration Test"]);

  await runGit(cwd, ["config", "user.email", "forgemind-test@example.invalid"]);
}

describe("Git fast-forward integration", () => {
  let root: string | undefined;

  afterEach(async () => {
    try {
      if (root) {
        await rm(root, { recursive: true, force: true });
      }
    } finally {
      root = undefined;
      isolatedGitConfigPath = undefined;

      if (originalGitConfigGlobal === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = originalGitConfigGlobal;
      }

      if (originalGitConfigNosystem === undefined) {
        delete process.env.GIT_CONFIG_NOSYSTEM;
      } else {
        process.env.GIT_CONFIG_NOSYSTEM = originalGitConfigNosystem;
      }

      if (originalGitTerminalPrompt === undefined) {
        delete process.env.GIT_TERMINAL_PROMPT;
      } else {
        process.env.GIT_TERMINAL_PROMPT = originalGitTerminalPrompt;
      }
    }
  });

  it("preserves divergent local history and recovers after merging", async () => {
    root = await mkdtemp(path.join(tmpdir(), "forgemind-git-integration-"));

    isolatedGitConfigPath = path.join(root, "empty.gitconfig");
    await writeFile(isolatedGitConfigPath, "");

    const remotePath = path.join(root, "remote.git");
    const seedPath = path.join(root, "seed");
    const workspacePath = path.join(root, "workspace");

    // Create a bare remote and an initial repository.
    await runGit(root, ["init", "--bare", "--initial-branch=main", remotePath]);

    await runGit(root, ["init", "--initial-branch=main", seedPath]);

    await configureGitIdentity(seedPath);

    await writeFile(path.join(seedPath, "base.txt"), "initial commit\n");

    await runGit(seedPath, ["add", "base.txt"]);
    await runGit(seedPath, ["commit", "-m", "Initial commit"]);

    await runGit(seedPath, ["remote", "add", "origin", remotePath]);

    await runGit(seedPath, ["push", "-u", "origin", "main"]);

    // Clone the initial history into a separate workspace.
    await runGit(root, ["clone", remotePath, workspacePath]);

    await configureGitIdentity(workspacePath);

    // Create a local commit that will diverge from the remote.
    await writeFile(path.join(workspacePath, "local.txt"), "local work\n");

    await runGit(workspacePath, ["add", "local.txt"]);
    await runGit(workspacePath, ["commit", "-m", "Local commit"]);

    const localCommitBeforeFetch = await runGit(workspacePath, [
      "rev-parse",
      "HEAD",
    ]);

    // Advance the remote independently.
    await writeFile(path.join(seedPath, "remote.txt"), "remote work\n");

    await runGit(seedPath, ["add", "remote.txt"]);
    await runGit(seedPath, ["commit", "-m", "Remote commit"]);
    await runGit(seedPath, ["push", "origin", "main"]);

    // Fetch succeeds, but fast-forward-only integration must reject
    // the divergent branch histories.
    await runGit(workspacePath, ["fetch", "origin"]);

    await expect(
      runGit(workspacePath, ["pull", "--ff-only"]),
    ).rejects.toThrow();

    // The failed pull must not replace the local commit or local work.
    expect(await runGit(workspacePath, ["rev-parse", "HEAD"])).toBe(
      localCommitBeforeFetch,
    );

    expect(await readFile(path.join(workspacePath, "local.txt"), "utf8")).toBe(
      "local work\n",
    );

    // The remote change has not been integrated yet.
    await expect(
      readFile(path.join(workspacePath, "remote.txt"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });

    // Resolve divergence explicitly, then verify pull succeeds.
    await runGit(workspacePath, ["merge", "--no-edit", "origin/main"]);

    await expect(
      runGit(workspacePath, ["pull", "--ff-only"]),
    ).resolves.toBeDefined();

    expect(
      (await readFile(path.join(workspacePath, "local.txt"), "utf8")).replace(
        /\r\n/g,
        "\n",
      ),
    ).toBe("local work\n");

    expect(
      (await readFile(path.join(workspacePath, "remote.txt"), "utf8")).replace(
        /\r\n/g,
        "\n",
      ),
    ).toBe("remote work\n");

    expect(await runGit(workspacePath, ["status", "--porcelain"])).toBe("");
  });

  it("times out a real clone, cleans up, and permits a retry", async () => {
    root = await mkdtemp(path.join(tmpdir(), "forgemind-git-timeout-"));

    isolatedGitConfigPath = path.join(root, "empty.gitconfig");
    process.env.GIT_CONFIG_GLOBAL = isolatedGitConfigPath;
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    process.env.GIT_TERMINAL_PROMPT = "0";

    await writeFile(isolatedGitConfigPath, "");

    const remotePath = path.join(root, "remote.git");
    const seedPath = path.join(root, "seed");
    const workspaceRoot = path.join(root, "workspaces");
    const repositoryId = "timeout-repository";
    const remoteUrl = "https://github.com/example/repository.git";

    await runGit(root, ["init", "--bare", "--initial-branch=main", remotePath]);
    await runGit(root, ["init", "--initial-branch=main", seedPath]);
    await configureGitIdentity(seedPath);

    await writeFile(
      path.join(seedPath, ".gitattributes"),
      "slow.txt filter=slow\n",
    );
    await writeFile(path.join(seedPath, "slow.txt"), "test content\n");

    await runGit(seedPath, ["add", ".gitattributes", "slow.txt"]);
    await runGit(seedPath, ["commit", "-m", "Add slow-filter fixture"]);
    await runGit(seedPath, ["remote", "add", "origin", remotePath]);
    await runGit(seedPath, ["push", "-u", "origin", "main"]);

    // Keep the production URL validation unchanged. Git rewrites this
    // approved test URL to the local bare repository in this isolated config.
    const slowFilterPath = path.join(root, "slow-filter.cjs");

    await writeFile(
      slowFilterPath,
      [
        "const chunks = [];",
        'process.stdin.on("data", chunk => chunks.push(chunk));',
        'process.stdin.on("end", () => {',
        "  setTimeout(() => {",
        "    process.stdout.write(Buffer.concat(chunks));",
        "  }, 1500);",
        "});",
        "",
      ].join("\n"),
    );

    await writeFile(
      isolatedGitConfigPath,
      [
        `[url "${pathToFileURL(remotePath).href}"]`,
        `    insteadOf = ${remoteUrl}`,
        "",
        '[filter "slow"]',
        `    smudge = node '${slowFilterPath.replace(/\\/g, "/")}'`,
        "    required = true",
        "",
      ].join("\n"),
    );

    const timedOperations = new GitOperations({
      workspaceRoot,
      operationTimeoutMs: 300,
      cloneTimeoutMs: 5_000,
      maxConcurrentOperations: 1,
    });

    await expect(
      timedOperations.cloneRepository(repositoryId, remoteUrl),
    ).rejects.toThrow("GIT_OPERATION_TIMEOUT");

    // A failed clone must not leave a published or staging workspace.
    expect(await readdir(workspaceRoot)).toEqual([]);

    // Retry with enough time for the real Git filter subprocess to finish.
    const retryOperations = new GitOperations({
      workspaceRoot,
      operationTimeoutMs: 5_000,
      cloneTimeoutMs: 5_000,
      maxConcurrentOperations: 1,
    });

    await expect(
      retryOperations.cloneRepository(repositoryId, remoteUrl),
    ).resolves.toMatchObject({
      repositoryId,
      branch: "main",
    });

    const workspaces = await readdir(workspaceRoot);

    expect(workspaces).toEqual([repositoryId]);
    expect(workspaces.some((name) => name.includes(".staging-"))).toBe(false);
  });
});
