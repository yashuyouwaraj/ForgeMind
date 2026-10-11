
import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt-verifier.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    workspaceId: string;
  };
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authorization = req.header("Authorization");

  if (!authorization) {
    res.status(401).json({
      success: false,
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
    return;
  }

  const [scheme, token, ...extra] = authorization.split(" ");

  if (scheme !== "Bearer" || !token || extra.length > 0) {
    res.status(401).json({
      success: false,
      error: { code: "INVALID_AUTHORIZATION_HEADER" },
    });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: { code: "INVALID_OR_EXPIRED_TOKEN" },
    });
  }
}
