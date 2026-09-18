import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";

import type {
  AuthTokenPayload,
} from "../../domain/auth/auth-types.js";
import type { AuthConfig } from "../../config/auth-config.js";

export class JwtService {
  constructor(private readonly config: AuthConfig) {}

  sign(payload: Omit<AuthTokenPayload, "iat" | "exp">): string {
    return jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.jwtExpiresIn as SignOptions["expiresIn"],
    });
  }

  verify(token: string): AuthTokenPayload {
    const payload = jwt.verify(
      token,
      this.config.jwtSecret,
    );

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