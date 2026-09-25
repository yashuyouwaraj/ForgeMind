import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { AuthenticationError } from "@forgemind/shared-errors";
import { validate } from "@forgemind/shared-validation";
import { ProjectService } from "../../application/project-service.js";
import {
  createProjectSchema,
  updateProjectSchema,
} from "./project-schema.js";
import { createAuthenticationMiddleware } from "../../middleware/authenticate.js";
import { JwtService } from "../../infrastructure/security/jwt-service.js";

const getRouteParamId = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

export function createProjectRoutes(
  projectService: ProjectService,
  jwtService: JwtService,
): Router {
  const router = Router();
  const authenticate = createAuthenticationMiddleware(jwtService);

  router.post(
    "/",
    authenticate,
    validate(createProjectSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          next(new AuthenticationError("Authentication token is required"));
          return;
        }

        const project = await projectService.createProject(
          req.user.userId,
          req.body,
        );

        res.status(201).json({
          success: true,
          data: project,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          next(new AuthenticationError("Authentication token is required"));
          return;
        }

        const projects = await projectService.listProjects(
          req.user.userId,
        );

        res.status(200).json({
          success: true,
          data: projects,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          next(new AuthenticationError("Authentication token is required"));
          return;
        }

        const projectId = getRouteParamId(req.params.id);

        const project = await projectService.getProject(
          projectId,
          req.user.userId,
        );

        res.status(200).json({
          success: true,
          data: project,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id",
    authenticate,
    validate(updateProjectSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          next(new AuthenticationError("Authentication token is required"));
          return;
        }

        const projectId = getRouteParamId(req.params.id);

        const project = await projectService.updateProject(
          projectId,
          req.user.userId,
          req.body,
        );

        res.status(200).json({
          success: true,
          data: project,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/:id",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          next(new AuthenticationError("Authentication token is required"));
          return;
        }

        const projectId = getRouteParamId(req.params.id);

        await projectService.deleteProject(
          projectId,
          req.user.userId,
        );

        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}