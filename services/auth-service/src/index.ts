import { createForgeMindApp } from "@forgemind/sdk";

export { createAuthenticationMiddleware } from "./middleware/authenticate.js";

export type {
  AuthenticatedUser,
  AuthTokenPayload,
} from "./domain/auth/auth-types.js";

export { prisma } from "./infrastructure/database/prisma.js";

export {
  UserRepository,
  type CreateUserInput,
} from "./repositories/user-repository.js";

export { loadAuthConfig, type AuthConfig } from "./config/auth-config.js";

export { JwtService } from "./infrastructure/jwt/jwt-service.js";
export { PasswordService } from "./infrastructure/security/password-service.js";

export {
  AuthService,
  type AuthResult,
  type RegisterInput,
  type LoginInput,
} from "./application/auth-service.js";

const app = createForgeMindApp({
  serviceName: "auth-service",
  requestLogging: true,
  cors: true,
  security: true,
  compression: true,
  apiPrefix: "/api",
});

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`ForgeMind Auth Service running on port ${port}`);
});
