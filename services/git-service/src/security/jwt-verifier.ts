
import jwt from "jsonwebtoken";
import type { AuthenticatedUser } from "@forgemind/shared-auth";

interface AuthTokenPayload extends AuthenticatedUser {
  iat: number;
  exp: number;
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  const payload: unknown = jwt.verify(token, secret);

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("userId" in payload) ||
    typeof payload.userId !== "string" ||
    !("workspaceId" in payload) ||
    typeof payload.workspaceId !== "string" ||
    !("iat" in payload) ||
    typeof payload.iat !== "number" ||
    !("exp" in payload) ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Invalid authentication token payload");
  }

  const verified = payload as AuthTokenPayload;

  return {
    userId: verified.userId,
    workspaceId: verified.workspaceId,
  };
}
