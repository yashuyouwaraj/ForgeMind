export const PROJECT_ROLES = [
  "OWNER",
  "ADMINISTRATOR",
  "MAINTAINER",
  "DEVELOPER",
  "VIEWER",
] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

export interface ProjectMembership {
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddProjectMemberInput {
  projectId: string;
  userId: string;
  role: ProjectRole;
}

export interface UpdateProjectMemberRoleInput {
  role: ProjectRole;
}