import type { Express } from "express";

export interface ForgeMindAppOptions {
  serviceName: string;
  requestLogging?: boolean;
  cors?: boolean;
  security?: boolean;
  compression?: boolean;
  apiPrefix?: string;
  registerRoutes?: (app: Express) => void;
  registerErrorHandlers?: boolean;
}