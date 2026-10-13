import type { Server } from "node:http";

export interface RuntimeConsumer {
  start(): Promise<void>;
  close(): Promise<void>;
}

export interface RuntimePublisher {
  close(): Promise<void>;
}

export interface GitServiceRuntimeDependencies {
  listen: (port: number) => Server;
  consumer: RuntimeConsumer;
  publisher: RuntimePublisher;
  port: number;
  shutdownTimeoutMs?: number;
}

export interface GitServiceRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

function waitForListening(server: Server): Promise<void> {
  if (server.listening) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };

    const onListening = () => {
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    server.once("listening", onListening);
    server.once("error", onError);

    if (server.listening) onListening();
  });
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  errorCode: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // Preserve the timeout as the primary failure.
      }

      reject(new Error(errorCode));
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function closeServer(server: Server | null): Promise<void> {
  if (!server || !server.listening) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function collectFailures(results: PromiseSettledResult<unknown>[]): unknown[] {
  return results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
}

export function createGitServiceRuntime({
  listen,
  consumer,
  publisher,
  port,
  shutdownTimeoutMs = 10_000,
}: GitServiceRuntimeDependencies): GitServiceRuntime {
  if (!Number.isFinite(shutdownTimeoutMs) || shutdownTimeoutMs <= 0) {
    throw new Error("INVALID_SHUTDOWN_TIMEOUT");
  }

  let server: Server | null = null;
  let started = false;
  let stopping = false;

  let startPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  let cleanupPromise: Promise<void> | null = null;

  async function closeResourcesInternal(): Promise<void> {
    const currentServer = server;

    const serverClose = withTimeout(
      closeServer(currentServer),
      shutdownTimeoutMs,
      "HTTP_SERVER_SHUTDOWN_TIMEOUT",
      () => {
        currentServer?.closeAllConnections?.();
      },
    );

    const results = await Promise.allSettled([
      serverClose,
      withTimeout(
        consumer.close(),
        shutdownTimeoutMs,
        "KAFKA_CONSUMER_SHUTDOWN_TIMEOUT",
      ),
      withTimeout(
        publisher.close(),
        shutdownTimeoutMs,
        "KAFKA_PUBLISHER_SHUTDOWN_TIMEOUT",
      ),
    ]);

    server = null;
    started = false;

    const failures = collectFailures(results);

    if (failures.length > 0) {
      throw new AggregateError(failures, "GIT_SERVICE_CLEANUP_FAILED");
    }
  }

  function closeResources(): Promise<void> {
    if (cleanupPromise) return cleanupPromise;

    cleanupPromise = closeResourcesInternal();
    return cleanupPromise;
  }

  async function startInternal(): Promise<void> {
    try {
      await consumer.start();

      if (stopping) {
        throw new Error("GIT_SERVICE_SHUTTING_DOWN");
      }

      server = listen(port);
      await waitForListening(server);

      if (stopping) {
        throw new Error("GIT_SERVICE_SHUTTING_DOWN");
      }

      started = true;
    } catch (startupError) {
      try {
        await closeResources();
      } catch (cleanupError) {
        if (startupError instanceof Error) {
          Object.assign(startupError, { cleanupError });
        }
      }

      throw startupError;
    }
  }

  async function start(): Promise<void> {
    if (stopping) throw new Error("GIT_SERVICE_SHUTTING_DOWN");
    if (started) return;
    if (startPromise) return startPromise;

    startPromise = startInternal();

    try {
      await startPromise;
    } finally {
      startPromise = null;
    }
  }

  async function stopInternal(): Promise<void> {
    let startupTimeout: unknown;

    if (startPromise) {
      try {
        await withTimeout(
          startPromise.catch(() => undefined),
          shutdownTimeoutMs,
          "GIT_SERVICE_STARTUP_SHUTDOWN_TIMEOUT",
        );
      } catch (error) {
        startupTimeout = error;
      }
    }

    let cleanupFailure: unknown;

    try {
      await closeResources();
    } catch (error) {
      cleanupFailure = error;
    }

    // Preserve the established cleanup error contract when cleanup alone fails.
    if (startupTimeout === undefined) {
      if (cleanupFailure !== undefined) {
        throw cleanupFailure;
      }

      return;
    }

    // When both startup waiting and cleanup fail, retain both failures.
    if (cleanupFailure !== undefined) {
      const cleanupErrors =
        cleanupFailure instanceof AggregateError
          ? [...cleanupFailure.errors]
          : [cleanupFailure];

      throw new AggregateError(
        [startupTimeout, ...cleanupErrors],
        "GIT_SERVICE_SHUTDOWN_FAILED",
      );
    }

    throw startupTimeout;
  }

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;

    stopping = true;
    stopPromise = stopInternal();

    return stopPromise;
  }

  return { start, stop };
}
