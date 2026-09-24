import { Router } from "express";
import { validate } from "@forgemind/shared-validation";
import type { Request, Response, NextFunction } from "express";
import {
  createProjectSchema,
  updateProjectSchema,
} from "./project-schema.js";
import { ProjectService } from "../../application/project-service.js";

export function createProjectRoutes(
  projectService: ProjectService,
  authenticate: ReturnType<
    typeof import("../../middleware/authenticate.js").createAuthenticationMiddleware
  >,
): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    validate(createProjectSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
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
          return;
        }

        const projectId = String(req.params.id);
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
          return;
        }

        const projectId = String(req.params.id);
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
          return;
        }

        const projectId = String(req.params.id);
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