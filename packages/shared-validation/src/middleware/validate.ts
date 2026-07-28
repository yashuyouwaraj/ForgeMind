import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

import { ValidationError } from "@forgemind/shared-errors";

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new ValidationError(result.error.message));
      return;
    }

    req.body = result.data;

    next();
  };
}