import type { NextFunction, Request, Response } from "express";
import { AuthenticationError } from "@forgemind/shared-errors";
import type { AuthenticatedUser } from "@forgemind/shared-auth";

interface JwtVerifier {
  verify(token: string): {
    userId: string;
    workspaceId: string;
  };
}

export function createAuthenticationMiddleware(
  jwtService: JwtVerifier,
) {
  return (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void => {
    const authorization = req.header("Authorization");

    if (!authorization) {
      next(
        new AuthenticationError(
          "Authentication token is required",
        ),
      );
      return;
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      next(
        new AuthenticationError(
          "Invalid authentication scheme",
        ),
      );
      return;
    }

    try {
      const payload = jwtService.verify(token);

      const authenticatedUser: AuthenticatedUser = {
        userId: payload.userId,
        workspaceId: payload.workspaceId,
      };

      req.user = authenticatedUser;
      next();
    } catch {
      next(
        new AuthenticationError(
          "Invalid or expired authentication token",
        ),
      );
    }
  };
}