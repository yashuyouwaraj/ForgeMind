import "./env.js";

import { EnvSchema } from "./schema.js";

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
