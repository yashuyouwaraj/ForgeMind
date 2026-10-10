
export const REPOSITORY_PROVIDERS = [
  "GITHUB",
  "GITLAB",
  "BITBUCKET",
  "AZURE_DEVOPS",
  "LOCAL_REPOSITORY",
  "ZIP_ARCHIVE",
] as const;

export type RepositoryProvider =
  (typeof REPOSITORY_PROVIDERS)[number];

export interface Repository {
  id: string;
  projectId: string;
  name: string;
  provider: RepositoryProvider;
  defaultBranch: string | null;
  url: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterRepositoryInput {
  projectId: string;
  name: string;
  provider: RepositoryProvider;
  defaultBranch?: string;
  url: string;
}

export interface RepositoryPagination {
  page: number;
  pageSize: number;
}
