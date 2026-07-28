import { BaseError } from "../base/base-error.js";

export class AuthenticationError extends BaseError {
  constructor(message = "Authentication failed") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}