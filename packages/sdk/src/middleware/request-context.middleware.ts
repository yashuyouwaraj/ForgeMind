import { Request, Response, NextFunction } from "express";
import { generateRequestId } from "@forgemind/shared-utils";

export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const requestId = generateRequestId();

  req.requestId = requestId;

  next();
}