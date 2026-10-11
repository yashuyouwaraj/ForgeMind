
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "./authenticate.js";
import * as jwtVerifier from "./jwt-verifier.js";

describe("Git Service authentication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects requests without a bearer token", async () => {
    const app = express();
    app.post("/protected", authenticate, (_req, res) => {
      res.sendStatus(204);
    });

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Test server address unavailable");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/protected`,
        { method: "POST" },
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: "AUTHENTICATION_REQUIRED" },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("rejects invalid bearer tokens", async () => {
    vi.spyOn(jwtVerifier, "verifyAccessToken").mockImplementation(() => {
      throw new Error("Invalid token");
    });

    const app = express();
    app.post("/protected", authenticate, (_req, res) => {
      res.sendStatus(204);
    });

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Test server address unavailable");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/protected`,
        {
          method: "POST",
          headers: { Authorization: "Bearer invalid-token" },
        },
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: "INVALID_OR_EXPIRED_TOKEN" },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
