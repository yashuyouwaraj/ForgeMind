import { environmentSchema } from "./schemas/environment.schema.js";

export function validateEnvironment() {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment configuration");
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}
