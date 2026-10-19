import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { logger } from '../../config/logger';
import { env } from '../../config/env';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && err.details.length > 0
          ? { details: err.details }
          : {}),
      },
    };

    if (!err.isOperational) {
      logger.error(
        { err, requestId: req.requestId },
        'Non-operational AppError'
      );
    }

    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    const response: ErrorResponse = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details,
      },
    };

    res.status(422).json(response);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaResponse = handlePrismaError(err);
    res.status(prismaResponse.statusCode).json(prismaResponse.body);
    return;
  }

  logger.error(
    { err, requestId: req.requestId, path: req.path, method: req.method },
    'Unhandled error'
  );

  const response: ErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message:
        env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message || 'An unexpected error occurred',
    },
  };

  res.status(500).json(response);
};

function handlePrismaError(err: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  body: ErrorResponse;
} {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[]) ?? [];
      return {
        statusCode: 409,
        body: {
          success: false,
          error: {
            code: ErrorCode.DUPLICATE_ENTRY,
            message: `A record with this ${target.join(', ')} already exists`,
            details: [{ fields: target }],
          },
        },
      };
    }

    case 'P2025':
    case 'P2001':
      return {
        statusCode: 404,
        body: {
          success: false,
          error: {
            code: ErrorCode.RESOURCE_NOT_FOUND,
            message:
              (err.meta?.cause as string) ||
              'The requested resource was not found',
          },
        },
      };

    case 'P2003':
      return {
        statusCode: 400,
        body: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Referenced resource does not exist',
            details: [{ field: err.meta?.field_name }],
          },
        },
      };

    case 'P2023':
      return {
        statusCode: 400,
        body: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid parameter format: malformed identifier',
          },
        },
      };

    default:
      return {
        statusCode: 500,
        body: {
          success: false,
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'A database error occurred',
          },
        },
      };
  }
}
