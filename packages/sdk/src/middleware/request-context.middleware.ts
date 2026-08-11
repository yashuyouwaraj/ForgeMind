import type { NextFunction, Request, Response } from "express";
import { generateRequestId } from "@forgemind/shared-utils";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const requestId = generateRequestId();

  req.requestId = requestId;

  next();
}
