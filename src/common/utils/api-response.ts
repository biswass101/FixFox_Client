import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>
) {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(meta && { meta }),
  });
}

export function sendCreated<T>(
  res: Response,
  data: T,
  meta?: Record<string, unknown>
) {
  return sendSuccess(res, data, 201, meta);
}

export function sendNoContent(res: Response) {
  return res.status(204).send();
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta
) {
  return res.status(200).json({
    success: true,
    data,
    meta: { pagination },
  });
}

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
