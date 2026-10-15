
import { describe, expect, it } from "vitest";

import {
  SyntaxParseError,
} from "./syntax-parse-result.js";
import { TreeSitterParser } from "./tree-sitter-parser.js";

describe("TreeSitterParser", () => {
  const parser = new TreeSitterParser();

  it("parses valid JavaScript", async () => {
    const result = await parser.parse(
      "const answer = 42;\nconsole.log(answer);",
      "javascript",
    );

    expect(result.languageId).toBe("javascript");
    expect(result.grammar).toBe("javascript");
    expect(result.hasSyntaxErrors).toBe(false);
    expect(result.rootNodeType).toBeTruthy();
    expect(result.nodeCount).toBeGreaterThan(1);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports malformed JavaScript", async () => {
    const result = await parser.parse(
      "const answer = ;",
      "javascript",
    );

    expect(result.hasSyntaxErrors).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("rejects unsupported languages explicitly", async () => {
    await expect(
      parser.parse("some source", "unknown-language"),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_LANGUAGE",
    });
  });

  it("rejects source that exceeds the configured byte limit", async () => {
    await expect(
      parser.parse("const answer = 42;", "javascript", {
        maxSourceBytes: 4,
      }),
    ).rejects.toMatchObject({
      code: "SOURCE_TOO_LARGE",
    });
  });

  it("rejects a syntax tree that exceeds the node limit", async () => {
    try {
      await parser.parse(
        "const answer = 42;",
        "javascript",
        { maxNodes: 1 },
      );

      throw new Error("Expected parsing to exceed the node limit.");
    } catch (error) {
      expect(error).toBeInstanceOf(SyntaxParseError);
      expect(error).toMatchObject({
        code: "NODE_LIMIT_EXCEEDED",
      });
    }
  });
});
