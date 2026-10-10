
import { z } from "zod";

export const repositoryProviderSchema = z.enum([
  "GITHUB",
  "GITLAB",
  "BITBUCKET",
  "AZURE_DEVOPS",
  "LOCAL_REPOSITORY",
  "ZIP_ARCHIVE",
]);

export const registerRepositorySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  provider: repositoryProviderSchema,
  defaultBranch: z.string().trim().min(1).max(255).optional(),
  url: z.string().trim().min(1).max(2048),
});

export const repositoryPaginationSchema = z.object({
  projectId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RegisterRepositoryRequest = z.infer<
  typeof registerRepositorySchema
>;
