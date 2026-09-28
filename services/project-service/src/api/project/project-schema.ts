import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

export const projectPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateProjectRequest = z.infer<typeof createProjectSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectSchema>;
