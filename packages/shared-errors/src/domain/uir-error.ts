import { BaseError } from "../base/base-error.js";

export class UriError extends BaseError {
  constructor(message = "Uri operation failed") {
    super(message, 500, "URI_ERROR");
  }
}