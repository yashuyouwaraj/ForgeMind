import { describe, expect, it, vi } from "vitest";

import type {
  SourceDiscoveryResult,
  SourceFileMetadata,
} from "../domain/source-file.js";
import type { SyntaxParseResult } from "./syntax-parse-result.js";
import {
  RepositoryParser,
  type RepositoryParserDependencies,
} from "./repository-parser.js";

const files: SourceFileMetadata[] = [
  {
    path: "src/index.ts",
    extension: ".ts",
    languageId: "typescript",
    sizeBytes: 18,
  },
  {
    path: "src/view.tsx",
    extension: ".tsx",
    languageId: "typescript",
    sizeBytes: 20,
  },
];

const discoveryResult: SourceDiscoveryResult = {
  files,
  totalBytes: 38,
  skippedCounts: {
    "excluded-directory": 0,
    "too-deep": 0,
    "unsafe-path": 0,
    symlink: 0,
    "not-regular-file": 0,
    "file-too-large": 0,
    "total-size-limit": 0,
    "file-count-limit": 0,
    "binary-content": 0,
    "file-unavailable": 0,
  },
  truncated: false,
};

function syntaxResult(languageId: string): SyntaxParseResult {
  return {
    languageId,
    grammar: languageId,
    hasSyntaxErrors: false,
    rootNodeType: "program",
    nodeCount: 3,
    diagnostics: [],
    diagnosticsTruncated: false,
  };
}

function createParser(overrides: Partial<RepositoryParserDependencies> = {}) {
  const discover = vi.fn(async () => discoveryResult);
  const read = vi.fn(async (_root: string, file: SourceFileMetadata) =>
    Buffer.from(
      file.path.endsWith(".tsx")
        ? "const View = () => <div />;"
        : "const answer = 42;",
    ),
  );
  const parse = vi.fn(async (_source: string, languageId: string) =>
    syntaxResult(languageId),
  );

  const dependencies: RepositoryParserDependencies = {
    discover,
    reader: { read },
    parser: { parse },
    ...overrides,
  };

  return {
    subject: new RepositoryParser(dependencies),
    discover,
    read,
    parse,
  };
}

describe("RepositoryParser", () => {
  it("discovers and parses repository files", async () => {
    const { subject, discover, parse } = createParser();

    const result = await subject.parseRepository("repository-root");

    expect(discover).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledTimes(2);
    expect(result.summary).toMatchObject({
      discoveredFiles: 2,
      parsedFiles: 2,
      failedFiles: 0,
      skippedFiles: 0,
      filesWithSyntaxErrors: 0,
      truncated: false,
    });
    expect(
      result.outcomes.every((outcome) => outcome.status === "parsed"),
    ).toBe(true);
  });

  it("selects the TSX grammar for TSX files", async () => {
    const { subject, parse } = createParser();

    await subject.parseRepository("repository-root");

    expect(parse).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      "typescript",
      expect.any(Object),
    );

    expect(parse).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      "tsx",
      expect.any(Object),
    );
  });

  it("records a per-file failure and continues parsing", async () => {
    const { subject } = createParser({
      parser: {
        parse: vi
          .fn()
          .mockRejectedValueOnce(new Error("GRAMMAR_UNAVAILABLE"))
          .mockResolvedValueOnce(syntaxResult("tsx")),
      },
    });

    const result = await subject.parseRepository("repository-root");

    expect(result.summary.failedFiles).toBe(1);
    expect(result.summary.parsedFiles).toBe(1);
    expect(result.outcomes[0]).toMatchObject({
      status: "failed",
      failureCode: "SOURCE_PARSE_FAILED",
    });
    expect(result.outcomes[1]?.status).toBe("parsed");
  });

  it("stops parsing when the repository byte budget is exhausted", async () => {
    const { subject, parse } = createParser({
      reader: {
        read: vi.fn(async (_root, file) =>
          Buffer.from(file.path.endsWith(".tsx") ? "12345" : "123"),
        ),
      },
    });

    const result = await subject.parseRepository("repository-root", {
      maxRepositoryBytes: 4,
    });

    expect(parse).toHaveBeenCalledOnce();
    expect(result.summary.parsedFiles).toBe(1);
    expect(result.summary.skippedFiles).toBe(1);
    expect(result.summary.truncated).toBe(true);
    expect(result.outcomes[1]).toMatchObject({
      status: "skipped",
      reason: "REPOSITORY_BYTE_LIMIT",
    });
  });

  it("rejects invalid resource limits", async () => {
    const { subject, discover } = createParser();

    await expect(
      subject.parseRepository("repository-root", {
        maxFileBytes: 0,
      }),
    ).rejects.toThrow("INVALID_REPOSITORY_PARSER_OPTION_MAX_FILE_BYTES");

    expect(discover).not.toHaveBeenCalled();
  });
});
