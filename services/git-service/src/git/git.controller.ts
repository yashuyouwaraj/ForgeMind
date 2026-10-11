import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { AuthenticationError } from "@forgemind/shared-errors";
import { authenticate } from "../security/authenticate.js";
import { RepositoryAccessClient } from "../security/repository-access-client.js";
import { GitOperations } from "./git-operations.js";

export interface GitRouterDependencies {
  gitOperations: Pick<
    GitOperations,
    "cloneRepository" | "synchronizeRepository"
  >;
  repositoryAccessClient: Pick<
    RepositoryAccessClient,
    "getAuthorizedRepository"
  >;
}

function getRepositoryId(value: string | string[] | undefined): string | null {
  const repositoryId = Array.isArray(value) ? value[0] : value;

  if (!repositoryId || !/^[A-Za-z0-9_-]{1,128}$/.test(repositoryId)) {
    return null;
  }

  return repositoryId;
}

export function createGitRouter({
  gitOperations,
  repositoryAccessClient,
}: GitRouterDependencies): Router {
  const router = Router();

  router.post(
    "/repositories/:repositoryId/clone",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const repositoryId = getRepositoryId(req.params.repositoryId);

        if (!repositoryId) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_REPOSITORY_ID" },
          });
          return;
        }

        const authorization = req.header("Authorization");

        if (!authorization) {
          throw new AuthenticationError("Authentication token is required");
        }

        const repository = await repositoryAccessClient.getAuthorizedRepository(
          repositoryId,
          authorization,
        );

        const result = await gitOperations.cloneRepository(
          repository.id,
          repository.url,
        );

        res.status(201).json({
          success: true,
          data: {
            repositoryId: result.repositoryId,
            remoteUrl: result.remoteUrl,
            branch: result.branch,
            headCommit: result.headCommit,
            synchronizedAt: result.completedAt,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/repositories/:repositoryId/synchronize",
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const repositoryId = getRepositoryId(req.params.repositoryId);

        if (!repositoryId) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_REPOSITORY_ID" },
          });
          return;
        }

        const authorization = req.header("Authorization");

        if (!authorization) {
          throw new AuthenticationError("Authentication token is required");
        }

        const repository = await repositoryAccessClient.getAuthorizedRepository(
          repositoryId,
          authorization,
        );

        const result = await gitOperations.synchronizeRepository(
          repository.id,
          repository.url,
        );

        res.status(200).json({
          success: true,
          data: {
            repositoryId: result.repositoryId,
            remoteUrl: result.remoteUrl,
            branch: result.branch,
            headCommit: result.headCommit,
            synchronizedAt: result.completedAt,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
