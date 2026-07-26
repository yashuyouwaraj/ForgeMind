import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().default(3000),
  APP_NAME: z.string(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),
  API_PREFIX: z.string(),
  JWT_SECRET: z.string(),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  KAFKA_BROKER: z.string(),
});

export type Environment = z.infer<typeof EnvSchema>;
