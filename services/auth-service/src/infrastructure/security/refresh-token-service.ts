import { createHash, randomBytes } from "node:crypto";

import { prisma } from "../database/prisma.js";

export class RefreshTokenService {
  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async create(userId: string, expiresAt: Date): Promise<string> {
    const token = randomBytes(48).toString("base64url");

    await prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(token),
        userId,
        expiresAt,
      },
    });

    return token;
  }

  async consume(token: string): Promise<{
    userId: string;
  } | null> {
    const tokenHash = this.hash(token);

    const storedToken = await prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date()
    ) {
      return null;
    }

    await prisma.refreshToken.update({
      where: {
        id: storedToken.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      userId: storedToken.userId,
    };
  }

  async revokeAll(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
