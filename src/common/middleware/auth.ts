import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { UnauthorizedError, ForbiddenError } from '../errors/app-error';
import { verifyAccessToken } from '../../modules/auth/token.util';
import { prisma } from '../../database/prisma';

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const cookieToken = req.cookies?.access_token as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;

  const rawToken = cookieToken || bearerToken;
  if (!rawToken) {
    return next(UnauthorizedError('Authentication required'));
  }

  const payload = verifyAccessToken(rawToken);
  if (!payload) {
    return next(UnauthorizedError('Invalid or expired authentication session'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, organizationId: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return next(UnauthorizedError('User account not found or deactivated'));
    }

    req.user = {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      sessionId: payload.sessionId,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return next(
        ForbiddenError(
          'You do not have the required permissions to perform this action'
        )
      );
    }

    next();
  };
}

export function requireTenantScope(
  paramName = 'organizationId'
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(UnauthorizedError('Authentication required'));
    }

    const targetOrgId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    if (targetOrgId && targetOrgId !== req.user.organizationId) {
      return next(
        ForbiddenError('Access to foreign organization data is forbidden')
      );
    }

    next();
  };
}

