import { describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth-service.js";

describe("AuthService", () => {
  it("registers a new user", async () => {
    const userRepository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "test@forgemind.local",
        passwordHash: "hashed-password",
        isActive: true,
      }),
      findById: vi.fn(),
    };

    const passwordService = {
      hash: vi.fn().mockResolvedValue("hashed-password"),
      verify: vi.fn(),
    };

    const jwtService = {
      sign: vi.fn().mockReturnValue("access-token"),
      verify: vi.fn(),
    };

    const refreshTokenService = {
      create: vi.fn().mockResolvedValue("refresh-token"),
      consume: vi.fn(),
      revokeAll: vi.fn(),
    };

    const authorizationService = {
      getUserRoles: vi.fn().mockResolvedValue([]),
    };

    const authService = new AuthService(
      userRepository as never,
      passwordService as never,
      jwtService as never,
      refreshTokenService as never,
      authorizationService as never,
    );

    const result = await authService.register({
      email: "test@forgemind.local",
      password: "Password123!",
    });

    expect(result.accessToken).toBe("access-token");

    expect(result.refreshToken).toBe("refresh-token");

    expect(passwordService.hash).toHaveBeenCalledWith("Password123!");

    expect(userRepository.create).toHaveBeenCalled();
  });

  it("rejects duplicate registration", async () => {
    const userRepository = {
      findByEmail: vi.fn().mockResolvedValue({
        id: "existing-user",
        email: "test@forgemind.local",
        passwordHash: "hashed-password",
        isActive: true,
      }),
      create: vi.fn(),
      findById: vi.fn(),
    };

    const passwordService = {
      hash: vi.fn(),
      verify: vi.fn(),
    };

    const jwtService = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const refreshTokenService = {
      create: vi.fn(),
      consume: vi.fn(),
      revokeAll: vi.fn(),
    };

    const authorizationService = {
      getUserRoles: vi.fn(),
    };

    const authService = new AuthService(
      userRepository as never,
      passwordService as never,
      jwtService as never,
      refreshTokenService as never,
      authorizationService as never,
    );

    await expect(
      authService.register({
        email: "test@forgemind.local",
        password: "Password123!",
      }),
    ).rejects.toThrow("A user with this email already exists");

    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials", async () => {
    const userRepository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      findById: vi.fn(),
    };

    const passwordService = {
      hash: vi.fn(),
      verify: vi.fn(),
    };

    const jwtService = {
      sign: vi.fn(),
      verify: vi.fn(),
    };

    const refreshTokenService = {
      create: vi.fn(),
      consume: vi.fn(),
      revokeAll: vi.fn(),
    };

    const authorizationService = {
      getUserRoles: vi.fn(),
    };

    const authService = new AuthService(
      userRepository as never,
      passwordService as never,
      jwtService as never,
      refreshTokenService as never,
      authorizationService as never,
    );

    await expect(
      authService.login({
        email: "unknown@forgemind.local",
        password: "Password123!",
      }),
    ).rejects.toThrow("Invalid email or password");
  });
});
