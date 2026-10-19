import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { authorize, requireTenantScope } from '../../src/common/middleware/auth';
import { AppError } from '../../src/common/errors/app-error';

describe('Authorization & Tenant Isolation Middleware', () => {
  const mockRes = {} as Response;

  describe('authorize', () => {
    it('allows access when user has one of the permitted roles', () => {
      const req = {
        user: {
          userId: 'user-1',
          organizationId: 'org-1',
          role: UserRole.MANAGER,
          sessionId: 'session-1',
        },
      } as unknown as Request;

      const next = vi.fn() as unknown as NextFunction;
      const middleware = authorize(UserRole.ADMIN, UserRole.MANAGER);

      middleware(req, mockRes, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('rejects with 403 Forbidden when user does not have a permitted role', () => {
      const req = {
        user: {
          userId: 'user-2',
          organizationId: 'org-1',
          role: UserRole.REPORTER,
          sessionId: 'session-2',
        },
      } as unknown as Request;

      const next = vi.fn() as unknown as NextFunction;
      const middleware = authorize(UserRole.ADMIN, UserRole.MANAGER);

      middleware(req, mockRes, next);
      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0] as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
    });

    it('rejects with 401 Unauthorized when no user is attached to request', () => {
      const req = {} as Request;
      const next = vi.fn() as unknown as NextFunction;
      const middleware = authorize(UserRole.ADMIN);

      middleware(req, mockRes, next);
      const error = (next as any).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });
  });

  describe('requireTenantScope', () => {
    it('allows access when organizationId matches authenticated user organization', () => {
      const req = {
        user: {
          userId: 'user-1',
          organizationId: 'org-123',
          role: UserRole.ADMIN,
          sessionId: 'session-1',
        },
        params: { organizationId: 'org-123' },
      } as unknown as Request;

      const next = vi.fn() as unknown as NextFunction;
      const middleware = requireTenantScope('organizationId');

      middleware(req, mockRes, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('rejects with 403 Forbidden when accessing cross-tenant resource', () => {
      const req = {
        user: {
          userId: 'user-1',
          organizationId: 'org-123',
          role: UserRole.ADMIN,
          sessionId: 'session-1',
        },
        params: { organizationId: 'foreign-org-456' },
      } as unknown as Request;

      const next = vi.fn() as unknown as NextFunction;
      const middleware = requireTenantScope('organizationId');

      middleware(req, mockRes, next);
      const error = (next as any).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(403);
    });
  });
});

