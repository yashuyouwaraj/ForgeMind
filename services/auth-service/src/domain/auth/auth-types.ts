export interface AuthenticatedUser {
  userId: string;
  workspaceId: string;
}

export interface AuthTokenPayload {
  userId: string;
  workspaceId: string;
  iat: number;
  exp: number;
}
