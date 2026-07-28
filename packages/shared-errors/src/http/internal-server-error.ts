import { BaseError } from "../base/base-error.js";

export class InternalServerError extends BaseError {
  constructor(message = "Internal Server Error") {
    super(message, 500, "INTERNAL_SERVER_ERROR");
  }
}