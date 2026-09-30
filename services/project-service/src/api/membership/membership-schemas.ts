import { z } from "zod";

export const projectMembershipRoleSchema = z.enum([
  "ADMINISTRATOR",
  "MAINTAINER",
  "DEVELOPER",
  "VIEWER",
]);

export const addProjectMemberSchema = z.object({
  userId: z.string().trim().min(1),
  role: projectMembershipRoleSchema,
});

export const updateProjectMemberRoleSchema = z.object({
  role: projectMembershipRoleSchema,
});

export type AddProjectMemberRequest = z.infer<
  typeof addProjectMemberSchema
>;

export type UpdateProjectMemberRoleRequest = z.infer<
  typeof updateProjectMemberRoleSchema
>;