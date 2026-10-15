
import { existsSync } from "node:fs";
import { getWasmPath } from "tree-sitter-wasm";
import { Language, Parser } from "web-tree-sitter";

import {
  SyntaxParseError,
  type SyntaxParseOptions,
  type SyntaxParseResult,
  type SyntaxDiagnostic,
} from "./syntax-parse-result.js";


type GrammarName =
  | "javascript"
  | "typescript"
  | "tsx"
  | "python"
  | "java"
  | "kotlin"
  | "go"
  | "rust"
  | "c_sharp"
  | "cpp"
  | "php"
  | "ruby"
  | "swift";

interface GrammarDefinition {
  readonly name: GrammarName;
  readonly aliases: readonly string[];
}


const GRAMMARS: readonly GrammarDefinition[] = [
  { name: "javascript", aliases: ["javascript", "js"] },
  { name: "typescript", aliases: ["typescript", "ts"] },
  { name: "tsx", aliases: ["tsx"] },
  { name: "python", aliases: ["python", "py"] },
  { name: "java", aliases: ["java"] },
  { name: "kotlin", aliases: ["kotlin", "kt"] },
  { name: "go", aliases: ["go", "golang"] },
  { name: "rust", aliases: ["rust", "rs"] },
  { name: "c_sharp", aliases: ["csharp", "c_sharp", "cs", "c#"] },
  { name: "cpp", aliases: ["cpp", "c++", "cxx"] },
  { name: "php", aliases: ["php"] },
  { name: "ruby", aliases: ["ruby", "rb"] },
  { name: "swift", aliases: ["swift"] },
];

const DEFAULT_MAX_SOURCE_BYTES = 1_048_576;
const DEFAULT_MAX_DIAGNOSTICS = 100;
const DEFAULT_MAX_NODES = 250_000;

let initializationPromise: Promise<void> | undefined;

const languagePromises = new Map<string, Promise<Language>>();

function normalizeLanguageId(languageId: string): string {
  return languageId.trim().toLowerCase();
}

function resolveGrammar(languageId: string): GrammarName {
  const normalized = normalizeLanguageId(languageId);

  const definition = GRAMMARS.find((grammar) =>
    grammar.aliases.includes(normalized),
  );

  if (!definition) {
    throw new SyntaxParseError(
      "UNSUPPORTED_LANGUAGE",
      `No Tree-sitter grammar mapping exists for language "${languageId}".`,
    );
  }

  return definition.name;
}

async function initializeParserRuntime(): Promise<void> {
  initializationPromise ??= Parser.init().catch((error: unknown) => {
    initializationPromise = undefined;

    throw new SyntaxParseError(
      "PARSER_INITIALIZATION_FAILED",
      `Tree-sitter initialization failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  });

  await initializationPromise;
}

async function loadLanguage(grammar: GrammarName): Promise<Language> {
  const existingPromise = languagePromises.get(grammar);

  if (existingPromise) {
    return existingPromise;
  }

  const languagePromise = (async () => {
    let wasmPath: string;

    try {
      wasmPath = getWasmPath(grammar);
    } catch {
      throw new SyntaxParseError(
        "GRAMMAR_UNAVAILABLE",
        `Tree-sitter grammar "${grammar}" is not available in tree-sitter-wasm.`,
      );
    }

    if (!existsSync(wasmPath)) {
      throw new SyntaxParseError(
        "GRAMMAR_UNAVAILABLE",
        `Tree-sitter grammar "${grammar}" was not found at the resolved package path.`,
      );
    }

    try {
      return await Language.load(wasmPath);
    } catch (error: unknown) {
      throw new SyntaxParseError(
        "GRAMMAR_UNAVAILABLE",
        `Could not load Tree-sitter grammar "${grammar}": ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  })();

  languagePromises.set(grammar, languagePromise);

  try {
    return await languagePromise;
  } catch (error) {
    languagePromises.delete(grammar);
    throw error;
  }
}

export class TreeSitterParser {
  async parse(
    source: string,
    languageId: string,
    options: SyntaxParseOptions = {},
  ): Promise<SyntaxParseResult> {
    const maxSourceBytes =
      options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
    const maxDiagnostics =
      options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS;
    const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;

    if (
      !Number.isSafeInteger(maxSourceBytes) ||
      maxSourceBytes < 1 ||
      !Number.isSafeInteger(maxDiagnostics) ||
      maxDiagnostics < 0 ||
      !Number.isSafeInteger(maxNodes) ||
      maxNodes < 1
    ) {
      throw new RangeError("Tree-sitter parser limits are invalid.");
    }

    const sourceBytes = Buffer.byteLength(source, "utf8");

    if (sourceBytes > maxSourceBytes) {
      throw new SyntaxParseError(
        "SOURCE_TOO_LARGE",
        `Source is ${sourceBytes} bytes; the configured limit is ${maxSourceBytes} bytes.`,
      );
    }

    const grammar = resolveGrammar(languageId);

    await initializeParserRuntime();

    const language = await loadLanguage(grammar);
    const parser = new Parser();

    let tree: ReturnType<Parser["parse"]> | undefined;

    try {
      parser.setLanguage(language);
      tree = parser.parse(source);

      if (!tree) {
        throw new SyntaxParseError(
          "PARSER_INITIALIZATION_FAILED",
          `Tree-sitter did not return a syntax tree for "${languageId}".`,
        );
      }

      const root = tree.rootNode;
      const diagnostics: SyntaxDiagnostic[] = [];
      const stack = [root];

      let nodeCount = 0;
      let diagnosticsTruncated = false;

      while (stack.length > 0) {
        const node = stack.pop();

        if (!node) {
          continue;
        }

        nodeCount += 1;

        if (nodeCount > maxNodes) {
          throw new SyntaxParseError(
            "NODE_LIMIT_EXCEEDED",
            `Syntax tree exceeded the configured limit of ${maxNodes} nodes.`,
          );
        }

        if (node.isError || node.isMissing) {
          if (diagnostics.length < maxDiagnostics) {
            diagnostics.push({
              kind: node.isMissing ? "missing" : "error",
              message: node.isMissing
                ? `Expected ${node.type}`
                : "Unexpected or invalid syntax",
              start: {
                row: node.startPosition.row,
                column: node.startPosition.column,
              },
              end: {
                row: node.endPosition.row,
                column: node.endPosition.column,
              },
            });
          } else {
            diagnosticsTruncated = true;
          }
        }

        for (let index = node.childCount - 1; index >= 0; index -= 1) {
          const child = node.child(index);

          if (child) {
            stack.push(child);
          }
        }
      }

      return {
        languageId,
        grammar,
        hasSyntaxErrors: root.hasError,
        rootNodeType: root.type,
        nodeCount,
        diagnostics,
        diagnosticsTruncated,
      };
    } finally {
      tree?.delete();
      parser.delete();
    }
  }
}

export const treeSitterParser = new TreeSitterParser();
