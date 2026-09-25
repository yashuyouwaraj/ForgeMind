import jwt from "jsonwebtoken";
import type { AuthenticatedUser } from "@forgemind/shared-auth";

export interface AuthTokenPayload extends AuthenticatedUser {
  iat: number;
  exp: number;
}

export class JwtService {
  constructor(
    private readonly jwtSecret: string,
  ) {}

  verify(token: string): AuthTokenPayload {
    const payload = jwt.verify(token, this.jwtSecret);

    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof payload.userId !== "string" ||
      typeof payload.workspaceId !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      throw new Error("Invalid authentication token payload");
    }

    return {
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}