import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import type {
  SourceDiscoveryResult,
  SourceFileMetadata,
} from "../domain/source-file.js";
import {
  discoverRepositorySources,
  type SourceDiscoveryOptions,
} from "../discovery/source-discovery.js";

import {
  SyntaxParseError,
  type SyntaxParseOptions,
  type SyntaxParseResult,
} from "./syntax-parse-result.js";
import { treeSitterParser } from "./tree-sitter-parser.js";
import type {
  RepositoryFileParseOutcome,
  RepositoryParseResult,
} from "./repository-parse-result.js";

export interface RepositoryParserOptions {
  readonly discovery?: Partial<SourceDiscoveryOptions>;
  readonly maxFileBytes?: number;
  readonly maxRepositoryBytes?: number;
  readonly maxDiagnosticsPerFile?: number;
  readonly maxSyntaxNodesPerFile?: number;
}

export interface SourceReader {
  read(
    repositoryRoot: string,
    file: SourceFileMetadata,
    maxBytes: number,
  ): Promise<Buffer>;
}

export interface SyntaxParser {
  parse(
    source: string,
    languageId: string,
    options?: SyntaxParseOptions,
  ): Promise<SyntaxParseResult>;
}

export interface RepositoryParserDependencies {
  readonly discover?: (
    repositoryRoot: string,
    options?: Partial<SourceDiscoveryOptions>,
  ) => Promise<SourceDiscoveryResult>;
  readonly reader?: SourceReader;
  readonly parser?: SyntaxParser;
}

const DEFAULT_MAX_FILE_BYTES = 1_048_576;
const DEFAULT_MAX_REPOSITORY_BYTES = 52_428_800;
const DEFAULT_MAX_DIAGNOSTICS_PER_FILE = 100;
const DEFAULT_MAX_SYNTAX_NODES_PER_FILE = 250_000;

const DEFAULT_READER: SourceReader = {
  async read(repositoryRoot, file, maxBytes) {
    const root = await realpath(repositoryRoot);

    if (
      path.posix.isAbsolute(file.path) ||
      path.win32.isAbsolute(file.path) ||
      file.path.includes("\0")
    ) {
      throw new Error("UNSAFE_SOURCE_PATH");
    }

    const segments = file.path.split("/");

    if (
      segments.some(
        (segment) => segment === "" || segment === "." || segment === "..",
      )
    ) {
      throw new Error("UNSAFE_SOURCE_PATH");
    }

    const absolutePath = path.resolve(root, ...segments);
    const relativePath = path.relative(root, absolutePath);

    if (
      relativePath === "" ||
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error("UNSAFE_SOURCE_PATH");
    }

    const before = await lstat(absolutePath);

    if (before.isSymbolicLink()) {
      throw new Error("SOURCE_SYMLINK_NOT_ALLOWED");
    }

    if (!before.isFile()) {
      throw new Error("SOURCE_NOT_REGULAR_FILE");
    }

    if (before.size > maxBytes) {
      throw new Error("SOURCE_FILE_TOO_LARGE");
    }

    const canonicalFile = await realpath(absolutePath);
    const canonicalRelative = path.relative(root, canonicalFile);

    if (
      canonicalRelative === "" ||
      canonicalRelative === ".." ||
      canonicalRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(canonicalRelative)
    ) {
      throw new Error("SOURCE_PATH_ESCAPES_REPOSITORY");
    }

    const buffer = await readFile(canonicalFile);

    if (buffer.length > maxBytes) {
      throw new Error("SOURCE_FILE_TOO_LARGE");
    }

    if (buffer.includes(0)) {
      throw new Error("SOURCE_BINARY_CONTENT");
    }

    return buffer;
  },
};

function validatePositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`INVALID_REPOSITORY_PARSER_OPTION_${name}`);
  }
}

function getGrammarLanguageId(file: SourceFileMetadata): string {
  const extension = file.extension.toLowerCase();

  // The TypeScript registry groups .ts and .tsx under "typescript",
  // but Tree-sitter uses a separate grammar for TSX.
  if (extension === ".tsx") {
    return "tsx";
  }

  // JavaScript's grammar supports JSX syntax.
  if (extension === ".jsx") {
    return "javascript";
  }

  if (extension === ".ts" || extension === ".mts" || extension === ".cts") {
    return "typescript";
  }

  return file.languageId;
}

function errorDetails(error: unknown): {
  readonly code: string;
  readonly message: string;
} {
  if (error instanceof SyntaxParseError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    // Keep error codes deterministic for known filesystem failures.
    const knownCodes = new Set([
      "UNSAFE_SOURCE_PATH",
      "SOURCE_SYMLINK_NOT_ALLOWED",
      "SOURCE_NOT_REGULAR_FILE",
      "SOURCE_FILE_TOO_LARGE",
      "SOURCE_BINARY_CONTENT",
      "SOURCE_PATH_ESCAPES_REPOSITORY",
      "ENOENT",
      "EACCES",
      "EPERM",
    ]);

    return {
      code: knownCodes.has(error.message)
        ? error.message
        : "SOURCE_PARSE_FAILED",
      message: error.message,
    };
  }

  return {
    code: "SOURCE_PARSE_FAILED",
    message: "An unknown error occurred while parsing the source file.",
  };
}

export class RepositoryParser {
  private readonly discover: NonNullable<
    RepositoryParserDependencies["discover"]
  >;

  private readonly reader: SourceReader;
  private readonly parser: SyntaxParser;

  constructor(dependencies: RepositoryParserDependencies = {}) {
    this.discover = dependencies.discover ?? discoverRepositorySources;
    this.reader = dependencies.reader ?? DEFAULT_READER;
    this.parser = dependencies.parser ?? treeSitterParser;
  }

  async parseRepository(
    repositoryRoot: string,
    options: RepositoryParserOptions = {},
  ): Promise<RepositoryParseResult> {
    const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    const maxRepositoryBytes =
      options.maxRepositoryBytes ?? DEFAULT_MAX_REPOSITORY_BYTES;
    const maxDiagnosticsPerFile =
      options.maxDiagnosticsPerFile ?? DEFAULT_MAX_DIAGNOSTICS_PER_FILE;
    const maxSyntaxNodesPerFile =
      options.maxSyntaxNodesPerFile ?? DEFAULT_MAX_SYNTAX_NODES_PER_FILE;

    validatePositiveInteger("MAX_FILE_BYTES", maxFileBytes);
    validatePositiveInteger("MAX_REPOSITORY_BYTES", maxRepositoryBytes);
    validatePositiveInteger("MAX_SYNTAX_NODES_PER_FILE", maxSyntaxNodesPerFile);

    if (
      !Number.isSafeInteger(maxDiagnosticsPerFile) ||
      maxDiagnosticsPerFile < 0
    ) {
      throw new Error(
        "INVALID_REPOSITORY_PARSER_OPTION_MAX_DIAGNOSTICS_PER_FILE",
      );
    }

    const discovery = await this.discover(repositoryRoot, options.discovery);

    const outcomes: RepositoryFileParseOutcome[] = [];
    let sourceBytesParsed = 0;
    let truncated = discovery.truncated;

    for (let index = 0; index < discovery.files.length; index += 1) {
      const file = discovery.files[index];

      if (!file) {
        continue;
      }

      if (sourceBytesParsed >= maxRepositoryBytes) {
        truncated = true;

        for (
          let remaining = index;
          remaining < discovery.files.length;
          remaining += 1
        ) {
          const remainingFile = discovery.files[remaining];

          if (remainingFile) {
            outcomes.push({
              status: "skipped",
              file: remainingFile,
              reason: "REPOSITORY_BYTE_LIMIT",
            });
          }
        }

        break;
      }

      const remainingBudget = maxRepositoryBytes - sourceBytesParsed;
      const fileByteLimit = Math.min(maxFileBytes, remainingBudget);

      let buffer: Buffer;

      try {
        buffer = await this.reader.read(repositoryRoot, file, fileByteLimit);
      } catch (error) {
        const details = errorDetails(error);

        if (details.code === "SOURCE_FILE_TOO_LARGE") {
          truncated = true;
        }

        outcomes.push({
          status: "failed",
          file,
          sourceBytes: 0,
          failureCode: details.code,
          message: details.message,
        });

        continue;
      }

      if (buffer.length > remainingBudget) {
        truncated = true;

        outcomes.push({
          status: "skipped",
          file,
          reason: "REPOSITORY_BYTE_LIMIT",
        });

        continue;
      }

      const source = buffer.toString("utf8");
      sourceBytesParsed += buffer.length;

      try {
        const syntax = await this.parser.parse(
          source,
          getGrammarLanguageId(file),
          {
            maxSourceBytes: fileByteLimit,
            maxDiagnostics: maxDiagnosticsPerFile,
            maxNodes: maxSyntaxNodesPerFile,
          },
        );

        outcomes.push({
          status: "parsed",
          file,
          sourceBytes: buffer.length,
          syntax,
        });
      } catch (error) {
        const details = errorDetails(error);

        outcomes.push({
          status: "failed",
          file,
          sourceBytes: buffer.length,
          failureCode: details.code,
          message: details.message,
        });
      }
    }

    const parsed = outcomes.filter((outcome) => outcome.status === "parsed");
    const failed = outcomes.filter((outcome) => outcome.status === "failed");
    const skipped = outcomes.filter((outcome) => outcome.status === "skipped");

    return {
      discovery,
      outcomes,
      summary: {
        discoveredFiles: discovery.files.length,
        parsedFiles: parsed.length,
        failedFiles: failed.length,
        skippedFiles: skipped.length,
        filesWithSyntaxErrors: parsed.filter(
          (outcome) =>
            outcome.status === "parsed" && outcome.syntax.hasSyntaxErrors,
        ).length,
        sourceBytesParsed,
        truncated,
      },
    };
  }
}

export const repositoryParser = new RepositoryParser();
