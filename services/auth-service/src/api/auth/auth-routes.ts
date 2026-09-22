import { Router } from "express";

import { validate } from "@forgemind/shared-validation";

import {
  AuthService,
  type LoginInput,
  type RegisterInput,
} from "../../application/auth-service.js";

import { loginSchema, refreshSchema, registerSchema } from "./auth-schemas.js";

export function createAuthRoutes(authService: AuthService): Router {
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

  return router;
}
