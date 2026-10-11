
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeRepositoryUrl,
  validateRepositoryUrl,
} from "./repository-url.js";

describe("validateRepositoryUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an HTTPS GitHub repository URL", () => {
    expect(
      validateRepositoryUrl("https://github.com/acme/engine.git"),
    ).toBe("https://github.com/acme/engine.git");
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() =>
      validateRepositoryUrl("http://github.com/acme/engine"),
    ).toThrow("UNSUPPORTED_REPOSITORY_URL");
  });

  it("rejects unapproved hosts", () => {
    expect(() =>
      validateRepositoryUrl("https://example.com/acme/engine"),
    ).toThrow("UNSUPPORTED_REPOSITORY_URL");
  });

  it("rejects embedded credentials", () => {
    expect(() =>
      validateRepositoryUrl(
        "https://user:password@github.com/acme/engine",
      ),
    ).toThrow("UNSUPPORTED_REPOSITORY_URL");
  });

  it("rejects URLs with query parameters", () => {
    expect(() =>
      validateRepositoryUrl(
        "https://github.com/acme/engine?token=secret",
      ),
    ).toThrow("UNSUPPORTED_REPOSITORY_URL");
  });

  it("normalizes trailing slashes and the .git suffix", () => {
    expect(
      normalizeRepositoryUrl("https://github.com/acme/engine.git"),
    ).toBe("https://github.com/acme/engine");
  });

  it("supports explicitly configured enterprise hosts", () => {
    vi.stubEnv("GIT_ALLOWED_HOSTS", "git.example.com");

    expect(
      validateRepositoryUrl(
        "https://git.example.com/platform/engine",
      ),
    ).toBe("https://git.example.com/platform/engine");
  });
});
