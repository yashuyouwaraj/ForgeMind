import { describe, expect, it } from "vitest";
import { createLanguageRegistry } from "./language-registry.js";

describe("createLanguageRegistry", () => {
  it("rejects duplicate extensions within one language definition", () => {
    expect(() =>
      createLanguageRegistry([
        {
          id: "typescript",
          displayName: "TypeScript",
          extensions: [".ts", ".TS"],
        },
      ]),
    ).toThrow("DUPLICATE_LANGUAGE_EXTENSION");
  });
});
