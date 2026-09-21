import type { AuthenticatedUser } from "../domain/auth/auth-types.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};