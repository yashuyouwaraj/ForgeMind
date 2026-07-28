import { BaseError } from "../base/base-error.js";

export class RepositoryError extends BaseError {
  constructor(message = "Repository operation failed") {
    super(message, 500, "REPOSITORY_ERROR");
  }
}