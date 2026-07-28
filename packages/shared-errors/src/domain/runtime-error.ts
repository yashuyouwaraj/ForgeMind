import { BaseError } from "../base/base-error.js";

export class RuntimeError extends BaseError {
  constructor(message = "Runtime operation failed") {
    super(message, 500, "RUNTIME_ERROR");
  }
}