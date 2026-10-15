
export interface SyntaxDiagnostic {
  readonly kind: "error" | "missing";
  readonly message: string;
  readonly start: {
    readonly row: number;
    readonly column: number;
  };
  readonly end: {
    readonly row: number;
    readonly column: number;
  };
}

export interface SyntaxParseResult {
  readonly languageId: string;
  readonly grammar: string;
  readonly hasSyntaxErrors: boolean;
  readonly rootNodeType: string;
  readonly nodeCount: number;
  readonly diagnostics: readonly SyntaxDiagnostic[];
  readonly diagnosticsTruncated: boolean;
}

export interface SyntaxParseOptions {
  readonly maxSourceBytes?: number;
  readonly maxDiagnostics?: number;
  readonly maxNodes?: number;
}

export type SyntaxParseErrorCode =
  | "UNSUPPORTED_LANGUAGE"
  | "GRAMMAR_UNAVAILABLE"
  | "SOURCE_TOO_LARGE"
  | "NODE_LIMIT_EXCEEDED"
  | "PARSER_INITIALIZATION_FAILED";

export class SyntaxParseError extends Error {
  constructor(
    public readonly code: SyntaxParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SyntaxParseError";
  }
}

