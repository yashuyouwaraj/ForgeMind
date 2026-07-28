import pino from "pino";
import { loggerOptions } from "./config/logger-options.js";

export function createLogger() {
  const isDevelopment = process.env.NODE_ENV !== "production";

  if (isDevelopment) {
    return pino({
      ...loggerOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino(loggerOptions);
}
