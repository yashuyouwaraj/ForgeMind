import "./env.js";
import { validateEnvironment } from "./validate.js";

export const config = validateEnvironment();
