import { z } from "zod";

export const environmentSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    APP_NAME: z.string().min(1),
    PORT: z.coerce.number().int().positive(),
    API_PREFIX: z.string().default("/api/v1"),
    LOG_LEVEL: z.enum(["fatal","error","warn","info","debug","trace"]),
    JWT_SECRET: z.string().min(32),
    DATABASE_URL: z.url,
    REDIS_URL: z.url,
    KAFKA_BROKERS: z.string().min(1)
})

export type Environment = z.infer<typeof environmentSchema>;