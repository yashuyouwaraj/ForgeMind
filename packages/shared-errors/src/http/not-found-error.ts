import { BaseError } from "../base/base-error.js";

export class NotFoundError extends BaseError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}