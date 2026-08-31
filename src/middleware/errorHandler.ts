import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

export interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: unknown[];
  stack?: string;
}

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return !!err && typeof err === "object" && (err as { code?: number }).code === 11000;
}

export const errorHandler = (
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let errors: unknown[] = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (isDuplicateKeyError(err)) {
    // Unique-index collision (slug, SKU, coupon code, etc.) — surface as a
    // clean 409 instead of an opaque 500 from the raw MongoDB driver error.
    statusCode = 409;
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : undefined;
    const value = field ? err.keyValue?.[field] : undefined;
    message =
      field && value !== undefined
        ? `${field} "${value}" is already in use`
        : "This value is already in use";
  }

  const response: ErrorResponse = {
    success: false,
    statusCode,
    message,
    ...(errors.length > 0 && { errors }),
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  };

  res.status(statusCode).json(response);
};
