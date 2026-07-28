import { BaseError } from "../base/base-error.js";

export class ValidationError extends BaseError {
  constructor(message = "Validation failed") {
    super(message, 400, "VALIDATION_ERROR");
  }
}