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

import { createAuthRoutes } from "./api/auth/auth-routes.js";
import { AuthService } from "./application/auth-service.js";
import { JwtService } from "./infrastructure/jwt/jwt-service.js";
import { PasswordService } from "./infrastructure/security/password-service.js";
import { UserRepository } from "./repositories/user-repository.js";
import { loadAuthConfig } from "./config/auth-config.js";

const authConfig = loadAuthConfig();

const userRepository = new UserRepository();
const passwordService = new PasswordService();
const jwtService = new JwtService(authConfig);

const authService = new AuthService(
  userRepository,
  passwordService,
  jwtService,
);

const app = createForgeMindApp({
  serviceName: "auth-service",
  requestLogging: true,
  cors: true,
  security: true,
  compression: true,
  apiPrefix: "/api",
  registerRoutes: (app) => {
    app.use("/api/auth", createAuthRoutes(authService));
  },
});

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`ForgeMind Auth Service running on port ${port}`);
});
