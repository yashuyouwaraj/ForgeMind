import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGitServiceRuntime } from "./runtime.js";

class FakeServer extends EventEmitter {
  listening = false;

  close = vi.fn((callback?: (error?: Error) => void) => {
    this.listening = false;
    callback?.();
    return this;
  });
}

function createHarness(shutdownTimeoutMs = 10_000) {
  const server = new FakeServer();

  const consumer = {
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const publisher = {
    close: vi.fn().mockResolvedValue(undefined),
  };

  const listen = vi.fn((_port: number) => {
    queueMicrotask(() => {
      server.listening = true;
      server.emit("listening");
    });

    return server as unknown as Server;
  });

  const runtime = createGitServiceRuntime({
    listen,
    consumer,
    publisher,
    port: 3004,
    shutdownTimeoutMs,
  });

  return { runtime, server, consumer, publisher, listen };
}

describe("Git Service runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts the consumer before listening for HTTP requests", async () => {
    const harness = createHarness();

    await harness.runtime.start();

    expect(harness.consumer.start).toHaveBeenCalledOnce();
    expect(harness.listen).toHaveBeenCalledWith(3004);
    expect(harness.server.listening).toBe(true);
  });

  it("closes the server, consumer, and publisher during shutdown", async () => {
    const harness = createHarness();

    await harness.runtime.start();
    await harness.runtime.stop();

    expect(harness.server.close).toHaveBeenCalledOnce();
    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });

  it("cleans up the consumer and publisher when consumer startup fails", async () => {
    const harness = createHarness();

    harness.consumer.start.mockRejectedValue(new Error("KAFKA_UNAVAILABLE"));

    await expect(harness.runtime.start()).rejects.toThrow("KAFKA_UNAVAILABLE");

    expect(harness.listen).not.toHaveBeenCalled();
    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });

  it("cleans up when the HTTP server fails to listen", async () => {
    const harness = createHarness();

    harness.listen.mockImplementationOnce(() => {
      queueMicrotask(() => {
        harness.server.emit("error", new Error("HTTP_LISTEN_FAILED"));
      });

      return harness.server as unknown as Server;
    });

    await expect(harness.runtime.start()).rejects.toThrow("HTTP_LISTEN_FAILED");

    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });

  it("makes repeated shutdown calls share the same operation", async () => {
    const harness = createHarness();

    await harness.runtime.start();

    await Promise.all([harness.runtime.stop(), harness.runtime.stop()]);

    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });

  it("force-closes HTTP connections when graceful shutdown times out", async () => {
    const harness = createHarness();
    const closeAllConnections = vi.fn();

    Object.assign(harness.server, { closeAllConnections });

    harness.server.close = vi.fn(
      ((_callback?: (error?: Error) => void) =>
        harness.server) as typeof harness.server.close,
    );

    const runtime = createGitServiceRuntime({
      listen: harness.listen,
      consumer: harness.consumer,
      publisher: harness.publisher,
      port: 3004,
      shutdownTimeoutMs: 10,
    });

    await runtime.start();

    await expect(runtime.stop()).rejects.toThrow("GIT_SERVICE_CLEANUP_FAILED");

    expect(closeAllConnections).toHaveBeenCalledOnce();
    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });

  it("reports multiple cleanup failures", async () => {
    const harness = createHarness();

    await harness.runtime.start();

    harness.consumer.close.mockRejectedValue(
      new Error("CONSUMER_CLOSE_FAILED"),
    );
    harness.publisher.close.mockRejectedValue(
      new Error("PUBLISHER_CLOSE_FAILED"),
    );

    await expect(harness.runtime.stop()).rejects.toMatchObject({
      message: "GIT_SERVICE_CLEANUP_FAILED",
      errors: expect.arrayContaining([
        expect.objectContaining({ message: "CONSUMER_CLOSE_FAILED" }),
        expect.objectContaining({ message: "PUBLISHER_CLOSE_FAILED" }),
      ]),
    });
  });

  it("rejects an invalid shutdown timeout", () => {
    const harness = createHarness();

    expect(() =>
      createGitServiceRuntime({
        listen: harness.listen,
        consumer: harness.consumer,
        publisher: harness.publisher,
        port: 3004,
        shutdownTimeoutMs: 0,
      }),
    ).toThrow("INVALID_SHUTDOWN_TIMEOUT");
  });

  it("reports a consumer shutdown timeout and still closes the publisher", async () => {
    const harness = createHarness(10);

    harness.consumer.close.mockImplementation(
      () => new Promise<void>(() => {}),
    );

    await harness.runtime.start();

    await expect(harness.runtime.stop()).rejects.toMatchObject({
      message: "GIT_SERVICE_CLEANUP_FAILED",
      errors: expect.arrayContaining([
        expect.objectContaining({
          message: "KAFKA_CONSUMER_SHUTDOWN_TIMEOUT",
        }),
      ]),
    });

    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });

  it("reports a startup timeout during shutdown and avoids duplicate cleanup", async () => {
    const harness = createHarness(10);

    let resolveConsumerStart!: () => void;

    harness.consumer.start.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConsumerStart = resolve;
        }),
    );

    const startPromise = harness.runtime
      .start()
      .catch((error: unknown) => error);

    // Allow startup to enter the pending consumer.start() call.
    await Promise.resolve();

    await expect(harness.runtime.stop()).rejects.toThrow(
      "GIT_SERVICE_STARTUP_SHUTDOWN_TIMEOUT",
    );

    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
    expect(harness.listen).not.toHaveBeenCalled();

    // Let startup finish after shutdown has already timed out.
    resolveConsumerStart();

    await expect(startPromise).resolves.toBeInstanceOf(Error);

    // Startup cleanup must not close the same resources a second time.
    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });
});
