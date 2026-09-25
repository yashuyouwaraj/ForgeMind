import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { errorHandler } from "../src/middleware/error-handler.js";
import { healthHandler } from "../src/middleware/health.js";
import { notFoundHandler } from "../src/middleware/not-found.js";
import type { ForgeMindAppOptions } from "../src/types/sdk-options.js";

export function createForgeMindApp(options: ForgeMindAppOptions): Express {
  const app = express();

  const {
    serviceName,
    requestLogging = true,
    cors: enableCors = true,
    security = true,
    compression: enableCompression = true,
    apiPrefix = "/api",
    registerErrorHandlers = true,
  } = options;

  app.set("serviceName", serviceName);

  if (security) {
    app.use(helmet());
  }

  if (enableCors) {
    app.use(cors());
  }

  if (enableCompression) {
    app.use(compression());
  }

  app.use(express.json());

  if (requestLogging) {
    app.use((req, _res, next) => {
      console.log(`[${serviceName}] ${req.method} ${req.originalUrl}`);
      next();
    });
  }

  app.get(`${apiPrefix}/health`, healthHandler);

  if (registerErrorHandlers) {
    app.use(notFoundHandler);
    app.use(errorHandler);
  }

  return app;
}