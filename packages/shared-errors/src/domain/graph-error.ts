import { BaseError } from "../base/base-error.js";

export class GraphError extends BaseError {
  constructor(message = "Graph operation failed") {
    super(message, 500, "GRAPH_ERROR");
  }
}