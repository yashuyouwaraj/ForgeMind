export abstract class BaseError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  protected constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
  ) {
    super(message);

    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
  }
}