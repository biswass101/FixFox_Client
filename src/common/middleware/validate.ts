import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, ZodError } from 'zod';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export const validate = (
  schema: ZodTypeAny,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req[source]);
      req[source] = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        next(
          new AppError(
            422,
            ErrorCode.VALIDATION_ERROR,
            'Validation failed',
            true,
            details
          )
        );
      } else {
        next(error);
      }
    }
  };
};
