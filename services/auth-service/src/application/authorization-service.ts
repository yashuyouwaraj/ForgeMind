import { prisma } from "../infrastructure/database/prisma.js";

export class AuthorizationService {
  async getUserRoles(
    userId: string,
  ): Promise<string[]> {
    const assignments =
      await prisma.userRole.findMany({
        where: {
          userId,
        },
        include: {
          role: true,
        },
      });

    return assignments.map(
      (assignment) => assignment.role.name,
    );
  }

  async hasRole(
    userId: string,
    roleName: string,
  ): Promise<boolean> {
    const assignment =
      await prisma.userRole.findFirst({
        where: {
          userId,
          role: {
            name: roleName,
          },
        },
      });

    return assignment !== null;
  }
}