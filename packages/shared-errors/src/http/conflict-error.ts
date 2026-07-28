import { BaseError } from "../base/base-error.js";

export class ConflictError extends BaseError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
  }
}