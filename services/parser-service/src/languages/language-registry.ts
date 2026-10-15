import path from "node:path";
import type { LanguageId } from "../domain/source-file.js";

export interface LanguageDefinition {
  readonly id: LanguageId;
  readonly displayName: string;
  readonly extensions: readonly string[];
}

export interface LanguageRegistry {
  detect(filePath: string): LanguageDefinition | undefined;
  get(languageId: LanguageId): LanguageDefinition | undefined;
  list(): readonly LanguageDefinition[];
}

const BUILT_IN_LANGUAGES: readonly LanguageDefinition[] = [
  {
    id: "javascript",
    displayName: "JavaScript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
  },
  {
    id: "typescript",
    displayName: "TypeScript",
    extensions: [".ts", ".tsx", ".mts", ".cts"],
  },
  {
    id: "python",
    displayName: "Python",
    extensions: [".py", ".pyi"],
  },
  {
    id: "java",
    displayName: "Java",
    extensions: [".java"],
  },
  {
    id: "kotlin",
    displayName: "Kotlin",
    extensions: [".kt", ".kts"],
  },
  {
    id: "go",
    displayName: "Go",
    extensions: [".go"],
  },
  {
    id: "rust",
    displayName: "Rust",
    extensions: [".rs"],
  },
  {
    id: "csharp",
    displayName: "C#",
    extensions: [".cs"],
  },
  {
    id: "cpp",
    displayName: "C++",
    extensions: [".cc", ".cpp", ".cxx", ".hh", ".hpp", ".hxx"],
  },
  {
    id: "php",
    displayName: "PHP",
    extensions: [".php"],
  },
  {
    id: "ruby",
    displayName: "Ruby",
    extensions: [".rb"],
  },
  {
    id: "swift",
    displayName: "Swift",
    extensions: [".swift"],
  },
];

export function createLanguageRegistry(
  definitions: readonly LanguageDefinition[] = BUILT_IN_LANGUAGES,
): LanguageRegistry {
  const byId = new Map<string, LanguageDefinition>();
  const byExtension = new Map<string, LanguageDefinition>();

  for (const definition of definitions) {
    const id = definition.id.trim();

    if (
      !id ||
      id !== definition.id ||
      !definition.displayName.trim() ||
      definition.extensions.length === 0
    ) {
      throw new Error("INVALID_LANGUAGE_DEFINITION");
    }

    if (byId.has(id)) {
      throw new Error("DUPLICATE_LANGUAGE_ID");
    }

    const seenExtensions = new Set<string>();
    const normalizedExtensions: string[] = [];

    for (const extension of definition.extensions) {
      const value = extension.toLowerCase();

      if (!/^\.[a-z0-9][a-z0-9._+-]*$/.test(value)) {
        throw new Error("INVALID_LANGUAGE_EXTENSION");
      }

      if (seenExtensions.has(value) || byExtension.has(value)) {
        throw new Error("DUPLICATE_LANGUAGE_EXTENSION");
      }

      seenExtensions.add(value);
      normalizedExtensions.push(value);
    }

    const normalized: LanguageDefinition = Object.freeze({
      ...definition,
      extensions: Object.freeze(normalizedExtensions),
    });

    byId.set(id, normalized);

    for (const extension of normalized.extensions) {
      byExtension.set(extension, normalized);
    }
  }

  return {
    detect(filePath) {
      const extension = path.extname(filePath).toLowerCase();
      return byExtension.get(extension);
    },

    get(languageId) {
      return byId.get(languageId);
    },

    list() {
      return [...byId.values()];
    },
  };
}

export const languageRegistry = createLanguageRegistry();