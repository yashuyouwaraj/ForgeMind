
import type {
  SourceDiscoveryResult,
  SourceFileMetadata,
} from "../domain/source-file.js";
import type { SyntaxParseResult } from "./syntax-parse-result.js";

export type RepositoryFileParseOutcome =
  | {
      readonly status: "parsed";
      readonly file: SourceFileMetadata;
      readonly sourceBytes: number;
      readonly syntax: SyntaxParseResult;
    }
  | {
      readonly status: "failed";
      readonly file: SourceFileMetadata;
      readonly sourceBytes: number;
      readonly failureCode: string;
      readonly message: string;
    }
  | {
      readonly status: "skipped";
      readonly file: SourceFileMetadata;
      readonly reason: string;
    };

export interface RepositoryParseSummary {
  readonly discoveredFiles: number;
  readonly parsedFiles: number;
  readonly failedFiles: number;
  readonly skippedFiles: number;
  readonly filesWithSyntaxErrors: number;
  readonly sourceBytesParsed: number;
  readonly truncated: boolean;
}

export interface RepositoryParseResult {
  readonly outcomes: readonly RepositoryFileParseOutcome[];
  readonly summary: RepositoryParseSummary;
  readonly discovery: SourceDiscoveryResult;
}
