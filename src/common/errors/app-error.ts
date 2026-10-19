import { ErrorCode, type ErrorCodeValue } from './error-codes';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeValue;
  public readonly isOperational: boolean;
  public readonly details?: unknown[];

  constructor(
    statusCode: number,
    code: ErrorCodeValue,
    message: string,
    isOperational = true,
    details?: unknown[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export function BadRequestError(message: string, details?: unknown[]) {
  return new AppError(400, ErrorCode.VALIDATION_ERROR, message, true, details);
}

export function UnauthorizedError(message = 'Authentication required') {
  return new AppError(401, ErrorCode.AUTHENTICATION_REQUIRED, message);
}

export function ForbiddenError(message = 'Insufficient permissions') {
  return new AppError(403, ErrorCode.INSUFFICIENT_PERMISSIONS, message);
}

export function NotFoundError(resource: string) {
  return new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, `${resource} not found`);
}

export function ConflictError(message: string) {
  return new AppError(409, ErrorCode.RESOURCE_CONFLICT, message);
}

export function ValidationError(message: string, details: unknown[]) {
  return new AppError(422, ErrorCode.VALIDATION_ERROR, message, true, details);
}

export function TooManyRequestsError(message = 'Too many requests, please try again later') {
  return new AppError(429, ErrorCode.RATE_LIMIT_EXCEEDED, message);
}

export function InternalError(message = 'An unexpected error occurred') {
  return new AppError(500, ErrorCode.INTERNAL_ERROR, message, false);
}
