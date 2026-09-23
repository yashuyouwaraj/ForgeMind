import { Router } from "express";

import { validate } from "@forgemind/shared-validation";

import {
  AuthService,
  type LoginInput,
  type RegisterInput,
} from "../../application/auth-service.js";

import {
  loginSchema,
  refreshSchema,
  registerSchema,
  logoutSchema,
} from "./auth-schemas.js";
import { createAuthenticationMiddleware } from "../../index.js";
import { AuthenticationError } from "@forgemind/shared-errors";

export function createAuthRoutes(
  authService: AuthService,
  authenticate: ReturnType<typeof createAuthenticationMiddleware>,
): Router {
  const router = Router();

  router.post("/register", validate(registerSchema), async (req, res, next) => {
    try {
      const input: RegisterInput = req.body;

      const result = await authService.register(input);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", validate(loginSchema), async (req, res, next) => {
    try {
      const input: LoginInput = req.body;

      const result = await authService.login(input);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/refresh", validate(refreshSchema), async (req, res, next) => {
    try {
      const result = await authService.refresh(req.body.refreshToken);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", validate(logoutSchema), async (req, res, next) => {
    try {
      await authService.logout(req.body.refreshToken);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/profile", authenticate, async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AuthenticationError("Authentication is required");
      }

      const profile = await authService.getProfile(req.user.userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
