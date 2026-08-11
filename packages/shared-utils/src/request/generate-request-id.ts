import { generateUuid } from "../uuid/generate-uuid.js";

export function generateRequestId(): string {
  return generateUuid();
}
