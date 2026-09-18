import { z } from "zod";

const authConfigSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("1h"),
});

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
}

export function loadAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const result = authConfigSchema.safeParse(env);

  if (!result.success) {
    throw new Error(
      `Invalid auth configuration: ${result.error.message}`,
    );
  }

  return {
    jwtSecret: result.data.JWT_SECRET,
    jwtExpiresIn: result.data.JWT_EXPIRES_IN,
  };
}