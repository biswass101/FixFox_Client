import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  InternalError,
} from '../../src/common/errors/app-error';
import { ErrorCode } from '../../src/common/errors/error-codes';

describe('AppError & Factory Functions', () => {
  it('creates an AppError with custom attributes', () => {
    const error = new AppError(400, ErrorCode.VALIDATION_ERROR, 'Test message', true, [{ field: 'test' }]);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.message).toBe('Test message');
    expect(error.isOperational).toBe(true);
    expect(error.details).toEqual([{ field: 'test' }]);
  });

  it('creates BadRequestError', () => {
    const error = BadRequestError('Bad input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('creates UnauthorizedError', () => {
    const error = UnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe(ErrorCode.AUTHENTICATION_REQUIRED);
    expect(error.message).toBe('Authentication required');
  });

  it('creates ForbiddenError', () => {
    const error = ForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
  });

  it('creates NotFoundError', () => {
    const error = NotFoundError('WorkOrder');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    expect(error.message).toBe('WorkOrder not found');
  });

  it('creates ConflictError', () => {
    const error = ConflictError('Email already registered');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe(ErrorCode.RESOURCE_CONFLICT);
  });

  it('creates ValidationError', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const error = ValidationError('Validation failed', details);
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.details).toEqual(details);
  });

  it('creates TooManyRequestsError', () => {
    const error = TooManyRequestsError();
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
  });

  it('creates InternalError with non-operational flag', () => {
    const error = InternalError();
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.isOperational).toBe(false);
  });
});

