import { AuthenticationError, ConflictError } from "@forgemind/shared-errors";

import type { AuthenticatedUser } from "../domain/auth/auth-types.js";
import { JwtService } from "../infrastructure/jwt/jwt-service.js";
import { PasswordService } from "../infrastructure/security/password-service.js";
import {
  UserRepository,
} from "../repositories/user-repository.js";

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: AuthenticatedUser;
  accessToken: string;
}

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    input: RegisterInput,
  ): Promise<AuthResult> {
    const existingUser =
      await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw new ConflictError(
        "A user with this email already exists",
      );
    }

    const passwordHash =
      await this.passwordService.hash(input.password);

    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
    });

    const authenticatedUser: AuthenticatedUser = {
      userId: user.id,
      workspaceId: "",
    };

    const accessToken = this.jwtService.sign({
      userId: authenticatedUser.userId,
      workspaceId: authenticatedUser.workspaceId,
    });

    return {
      user: authenticatedUser,
      accessToken,
    };
  }

  async login(
    input: LoginInput,
  ): Promise<AuthResult> {
    const user =
      await this.userRepository.findByEmail(input.email);

    if (!user || !user.isActive) {
      throw new AuthenticationError(
        "Invalid email or password",
      );
    }

    const passwordValid =
      await this.passwordService.verify(
        input.password,
        user.passwordHash,
      );

    if (!passwordValid) {
      throw new AuthenticationError(
        "Invalid email or password",
      );
    }

    const authenticatedUser: AuthenticatedUser = {
      userId: user.id,
      workspaceId: "",
    };

    const accessToken = this.jwtService.sign({
      userId: authenticatedUser.userId,
      workspaceId: authenticatedUser.workspaceId,
    });

    return {
      user: authenticatedUser,
      accessToken,
    };
  }
}