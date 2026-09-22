import type { User } from "@prisma/client";

import { prisma } from "../infrastructure/database/prisma.js";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async create(input: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
      },
    });
  }

  async deactivate(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}