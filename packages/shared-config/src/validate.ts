import { environmentSchema } from "./schemas/environment.schema.js";

export function validateEnvironment() {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration: ${JSON.stringify(
        result.error.format(),
        null,
        2,
      )}`,
    );
  }

  return result.data;
}
