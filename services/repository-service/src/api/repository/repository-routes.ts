
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  AuthenticationError,
} from "@forgemind/shared-errors";
import { validate } from "@forgemind/shared-validation";
import { RepositoryService } from "../../application/repository-service.js";
import { JwtService } from "../../infrastructure/security/jwt-service.js";
import { ProjectAccessClient } from "../../infrastructure/security/project-access-client.js";
import { createAuthenticationMiddleware } from "../../infrastructure/security/authentication-middleware.js";
import {
  registerRepositorySchema,
  repositoryPaginationSchema,
} from "./repository-schema.js";

const getRouteParamId = (
  value: string | string[] | undefined,
): string => {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
};

export function createRepositoryRoutes(
  repositoryService: RepositoryService,
  jwtService: JwtService,
  projectAccessClient: ProjectAccessClient,
): Router {
  const router = Router();
  const authenticate = createAuthenticationMiddleware(jwtService);

  router.post(
    "/",
    authenticate,
    validate(registerRepositorySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          throw new AuthenticationError(
            "Authentication token is required",
          );
        }

        const authorization = req.header("Authorization");

        if (!authorization) {
          throw new AuthenticationError(
            "Authentication token is required",
          );
        }

        await projectAccessClient.assertProjectOwner(
          req.body.projectId,
          authorization,
        );

        const repository =
          await repositoryService.registerRepository(req.body);

        res.status(201).json({
          success: true,
          data: repository,
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
          throw new AuthenticationError(
            "Authentication token is required",
          );
        }

        const authorization = req.header("Authorization");

        if (!authorization) {
          throw new AuthenticationError(
            "Authentication token is required",
          );
        }

        const pagination = repositoryPaginationSchema.parse(req.query);

        await projectAccessClient.assertProjectOwner(
          pagination.projectId,
          authorization,
        );

        const result = await repositoryService.listRepositories(
          pagination.projectId,
          {
            page: pagination.page,
            pageSize: pagination.pageSize,
          },
        );

        res.status(200).json({
          success: true,
          data: result.repositories,
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalPages:
              result.total === 0
                ? 0
                : Math.ceil(result.total / pagination.pageSize),
            totalRecords: result.total,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:repositoryId",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          throw new AuthenticationError(
            "Authentication token is required",
          );
        }

        const authorization = req.header("Authorization");

        if (!authorization) {
          throw new AuthenticationError(
            "Authentication token is required",
          );
        }

        const repositoryId = getRouteParamId(
          req.params.repositoryId,
        );

        const repository =
          await repositoryService.getRepository(repositoryId);

        await projectAccessClient.assertProjectOwner(
          repository.projectId,
          authorization,
        );

        res.status(200).json({
          success: true,
          data: repository,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
