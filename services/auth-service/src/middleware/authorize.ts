import type { NextFunction, Request, Response } from "express";

import {
  AuthenticationError,
  AuthorizationError,
} from "@forgemind/shared-errors";

import { AuthorizationService } from "../application/authorization-service.js";

export function createAuthorizationMiddleware(
  authorizationService: AuthorizationService,
  ...requiredRoles: string[]
) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      next(new AuthenticationError("Authentication is required"));
      return;
    }

    if (requiredRoles.length === 0) {
      next();
      return;
    }

    try {
      const roles = await authorizationService.getUserRoles(req.user.userId);

      const authorized = requiredRoles.some((role) => roles.includes(role));

      if (!authorized) {
        next(
          new AuthorizationError(
            "You do not have permission to access this resource",
          ),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
