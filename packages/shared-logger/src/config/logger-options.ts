import type { LoggerOptions } from "pino";

export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",

  timestamp: true,

  base: {
    application: "ForgeMind",
  },
};