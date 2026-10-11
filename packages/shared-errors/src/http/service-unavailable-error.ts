
import { BaseError } from "../base/base-error.js";

export class ServiceUnavailableError extends BaseError {
  constructor(message = "A required service is temporarily unavailable") {
    super(message, 503, "SERVICE_UNAVAILABLE");
  }
}
