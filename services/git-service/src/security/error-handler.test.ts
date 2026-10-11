
import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import {
  NotFoundError,
  ServiceUnavailableError,
} from "@forgemind/shared-errors";
import { errorHandler } from "@forgemind/sdk";

describe("shared error handler contract", () => {
  const app = express();

  app.get("/not-found", (_req, _res, next) => {
    next(new NotFoundError("Repository not found"));
  });

  app.get("/unavailable", (_req, _res, next) => {
    next(new ServiceUnavailableError());
  });

  app.use(errorHandler);

  const server = app.listen(0);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("maps NotFoundError to HTTP 404", async () => {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Test server address unavailable");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/not-found`,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("maps ServiceUnavailableError to HTTP 503", async () => {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Test server address unavailable");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/unavailable`,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "SERVICE_UNAVAILABLE" },
    });
  });
});
