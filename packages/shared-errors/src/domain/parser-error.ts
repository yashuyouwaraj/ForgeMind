import { BaseError } from "../base/base-error.js";

export class ParserError extends BaseError {
  constructor(message = "Parser operation failed") {
    super(message, 500, "PARSER_ERROR");
  }
}