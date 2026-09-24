import type { AuthenticatedUser } from "@forgemind/shared-auth";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};