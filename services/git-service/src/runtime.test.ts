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

function createHarness() {
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

    harness.consumer.start.mockRejectedValue(
      new Error("KAFKA_UNAVAILABLE"),
    );

    await expect(harness.runtime.start()).rejects.toThrow(
      "KAFKA_UNAVAILABLE",
    );

    expect(harness.listen).not.toHaveBeenCalled();
    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });

  it("cleans up when the HTTP server fails to listen", async () => {
    const harness = createHarness();

    harness.listen.mockImplementationOnce(() => {
      queueMicrotask(() => {
        harness.server.emit(
          "error",
          new Error("HTTP_LISTEN_FAILED"),
        );
      });

      return harness.server as unknown as Server;
    });

    await expect(harness.runtime.start()).rejects.toThrow(
      "HTTP_LISTEN_FAILED",
    );

    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });

  it("makes repeated shutdown calls share the same operation", async () => {
    const harness = createHarness();

    await harness.runtime.start();

    await Promise.all([
      harness.runtime.stop(),
      harness.runtime.stop(),
    ]);

    expect(harness.consumer.close).toHaveBeenCalledOnce();
    expect(harness.publisher.close).toHaveBeenCalledOnce();
  });
});