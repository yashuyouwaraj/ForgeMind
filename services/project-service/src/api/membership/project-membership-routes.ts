import type { Router } from "express";
import { Router as createRouter } from "express";
import { validate } from "@forgemind/shared-validation";

import { ProjectMembershipService } from "../../application/project-membership-service.js";
import { JwtService } from "../../infrastructure/security/jwt-service.js";
import { createAuthenticationMiddleware } from "../../middleware/authenticate.js";

import {
  addProjectMemberSchema,
  updateProjectMemberRoleSchema,
} from "./membership-schemas.js";

const getRouteParamId = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

export function createProjectMembershipRoutes(
  projectMembershipService: ProjectMembershipService,
  jwtService: JwtService,
): Router {
  const router = createRouter({
    mergeParams: true,
  });
  const authenticate = createAuthenticationMiddleware(jwtService);

  router.post(
    "/",
    authenticate,
    validate(addProjectMemberSchema),
    async (req, res, next) => {
      try {
        if (!req.user) {
          return;
        }

        const membership = await projectMembershipService.addMember(
          req.user.userId,
          {
            projectId: getRouteParamId(req.params.id),
            userId: req.body.userId,
            role: req.body.role,
          },
        );

        res.status(201).json({
          success: true,
          data: membership,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/", authenticate, async (req, res, next) => {
    try {
      if (!req.user) {
        return;
      }

      const memberships = await projectMembershipService.listMembers(
        req.user.userId,
        getRouteParamId(req.params.id),
      );

      res.status(200).json({
        success: true,
        data: memberships,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/:userId",
    authenticate,
    validate(updateProjectMemberRoleSchema),
    async (req, res, next) => {
      try {
        if (!req.user) {
          return;
        }

        const membership = await projectMembershipService.updateMemberRole(
          req.user.userId,
          getRouteParamId(req.params.id),
          getRouteParamId(req.params.userId),
          req.body,
        );

        res.status(200).json({
          success: true,
          data: membership,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete("/:userId", authenticate, async (req, res, next) => {
    try {
      if (!req.user) {
        return;
      }

      await projectMembershipService.removeMember(
        req.user.userId,
        getRouteParamId(req.params.id),
        getRouteParamId(req.params.userId),
      );

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
