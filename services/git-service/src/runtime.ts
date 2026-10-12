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
}

export interface GitServiceRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

function waitForListening(server: Server): Promise<void> {
  if (server.listening) {
    return Promise.resolve();
  }

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

    // Handle the server becoming ready between the initial check
    // and registration of the event listeners.
    if (server.listening) {
      onListening();
    }
  });
}

function closeServer(server: Server | null): Promise<void> {
  if (!server || !server.listening) {
    return Promise.resolve();
  }

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

export function createGitServiceRuntime({
  listen,
  consumer,
  publisher,
  port,
}: GitServiceRuntimeDependencies): GitServiceRuntime {
  let server: Server | null = null;
  let started = false;
  let stopping = false;

  let startPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;

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
    } catch (error) {
      const results = await Promise.allSettled([
        closeServer(server),
        consumer.close(),
        publisher.close(),
      ]);

      server = null;

      // Preserve the startup error as the primary failure.
      void results;
      throw error;
    }
  }

  async function start(): Promise<void> {
    if (stopping) {
      throw new Error("GIT_SERVICE_SHUTTING_DOWN");
    }

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
    if (startPromise) {
      await startPromise.catch(() => undefined);
    }

    const results = await Promise.allSettled([
      closeServer(server),
      consumer.close(),
      publisher.close(),
    ]);

    server = null;
    started = false;

    const failure = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );

    if (failure) {
      throw failure.reason;
    }
  }

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;

    stopping = true;
    stopPromise = stopInternal();

    return stopPromise;
  }

  return { start, stop };
}