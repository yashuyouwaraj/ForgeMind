import { AuthenticationError, ConflictError } from "@forgemind/shared-errors";

import type { AuthenticatedUser } from "../domain/auth/auth-types.js";
import { JwtService } from "../infrastructure/jwt/jwt-service.js";
import { PasswordService } from "../infrastructure/security/password-service.js";
import { UserRepository } from "../repositories/user-repository.js";
import { RefreshTokenService } from "../infrastructure/security/refresh-token-service.js";
import { AuthorizationService } from "./authorization-service.js";
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
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw new ConflictError("A user with this email already exists");
    }

    const passwordHash = await this.passwordService.hash(input.password);

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

    const refreshToken = await this.refreshTokenService.create(
      user.id,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );

    return {
      user: authenticatedUser,
      accessToken,
      refreshToken,
    };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(input.email);

    if (!user || !user.isActive) {
      throw new AuthenticationError("Invalid email or password");
    }

    const passwordValid = await this.passwordService.verify(
      input.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new AuthenticationError("Invalid email or password");
    }

    const authenticatedUser: AuthenticatedUser = {
      userId: user.id,
      workspaceId: "",
    };

    const accessToken = this.jwtService.sign({
      userId: authenticatedUser.userId,
      workspaceId: authenticatedUser.workspaceId,
    });

    const refreshToken = await this.refreshTokenService.create(
      user.id,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );

    return {
      user: authenticatedUser,
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    const tokenData = await this.refreshTokenService.consume(refreshToken);

    if (!tokenData) {
      throw new AuthenticationError("Invalid or expired refresh token");
    }

    const user = await this.userRepository.findById(tokenData.userId);

    if (!user || !user.isActive) {
      throw new AuthenticationError("User is not active");
    }

    const workspaceId = "";

    const accessToken = this.jwtService.sign({
      userId: user.id,
      workspaceId,
    });

    const newRefreshToken = await this.refreshTokenService.create(
      user.id,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenData = await this.refreshTokenService.consume(refreshToken);

    if (!tokenData) {
      throw new AuthenticationError("Invalid or expired refresh token");
    }
  }

  async getProfile(userId: string): Promise<{
    id: string;
    email: string;
    isActive: boolean;
    roles: string[];
  }> {
    const user = await this.userRepository.findById(userId);

    if (!user || !user.isActive) {
      throw new AuthenticationError("Authenticated user was not found");
    }

    const roles = await this.authorizationService.getUserRoles(userId);

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      roles,
    };
  }
}
