import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '../errors/error-codes';

export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCode.RESOURCE_NOT_FOUND,
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}
