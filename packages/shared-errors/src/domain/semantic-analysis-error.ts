import { BaseError } from "../base/base-error.js";

export class SemanticAnalysisError extends BaseError {
  constructor(message = "Semantic Analysis operation failed") {
    super(message, 500, "SEMANTICANALYSIS_ERROR");
  }
}