import { v7 as uuidv7 } from "uuid";

export function generateRequestId(): string {
  return uuidv7();
}
