import { z } from "zod";

export const workspaceSchema = z.object({
  GIT_WORKSPACE_ROOT: z.string().trim().min(1).optional(),
});

export type WorkspaceEnvironment = z.infer<typeof workspaceSchema>;
