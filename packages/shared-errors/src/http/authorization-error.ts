import { BaseError } from "../base/base-error.js";

export class AuthorizationError extends BaseError {
  constructor(message = "Forbidden") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}