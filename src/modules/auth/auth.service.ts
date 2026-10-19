import crypto from 'crypto';
import ms from 'ms';
import { env } from '../../config/env';
import { authRepository, AuthRepository } from './auth.repository';
import { hashPassword, verifyPassword } from './password.util';
import { createAccessToken, generateOpaqueToken, hashToken } from './token.util';
import {
  AppError,
  UnauthorizedError,
  ConflictError,
  BadRequestError,
} from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type {
  AuthTokens,
  AuthenticatedUserResponse,
  RequestClientMeta,
} from './auth.types';
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ResetPasswordInput,
} from './auth.schemas';

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'org';
}

export class AuthService {
  constructor(private readonly repo: AuthRepository = authRepository) {}

  async register(
    input: RegisterInput,
    meta?: RequestClientMeta
  ): Promise<{ user: AuthenticatedUserResponse; tokens: AuthTokens }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.repo.findUserByEmail(normalizedEmail);
    if (existing) {
      throw ConflictError('An account with this email address already exists');
    }

    const passwordHash = await hashPassword(input.password);

    let slug = slugify(input.organizationName);
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    slug = `${slug}-${randomSuffix}`;

    const { user, organization } = await this.repo.createOrganizationWithAdmin({
      orgName: input.organizationName,
      orgSlug: slug,
      fullName: input.fullName,
      email: input.email,
      normalizedEmail,
      passwordHash,
    });

    const tokens = await this.issueSessionTokens(user.id, user.role, organization.id, meta);

    return {
      user: this.formatUserResponse(user, organization),
      tokens,
    };
  }

  async login(
    input: LoginInput,
    meta?: RequestClientMeta
  ): Promise<{ user: AuthenticatedUserResponse; tokens: AuthTokens }> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const userWithOrg = await this.repo.findUserByEmail(normalizedEmail);

    if (!userWithOrg) {
      throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    if (!userWithOrg.isActive) {
      throw new AppError(403, ErrorCode.ACCOUNT_DEACTIVATED, 'Your account has been deactivated');
    }

    const isMatch = await verifyPassword(userWithOrg.passwordHash, input.password);
    if (!isMatch) {
      throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    await this.repo.updateLastLogin(userWithOrg.id);

    const tokens = await this.issueSessionTokens(
      userWithOrg.id,
      userWithOrg.role,
      userWithOrg.organizationId,
      meta
    );

    return {
      user: this.formatUserResponse(userWithOrg, userWithOrg.organization),
      tokens,
    };
  }

  async refresh(
    rawRefreshToken: string,
    _meta?: RequestClientMeta
  ): Promise<{ tokens: AuthTokens }> {
    if (!rawRefreshToken) {
      throw UnauthorizedError('Refresh token is required');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await this.repo.findSessionByTokenHash(tokenHash);

    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw new AppError(401, ErrorCode.SESSION_EXPIRED, 'Session has expired or been revoked');
    }

    if (!session.user.isActive) {
      throw new AppError(403, ErrorCode.ACCOUNT_DEACTIVATED, 'Your account has been deactivated');
    }

    const refreshTtlMs = ms(env.REFRESH_TOKEN_TTL) || 7 * 24 * 60 * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + refreshTtlMs);

    const { rawToken: newRefreshToken, tokenHash: newTokenHash } = generateOpaqueToken();

    await this.repo.rotateSession(session.id, newTokenHash, newExpiresAt);

    const accessToken = createAccessToken({
      sub: session.user.id,
      orgId: session.user.organizationId,
      role: session.user.role,
      sessionId: session.id,
    });

    return {
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    };
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await this.repo.findSessionByTokenHash(tokenHash);
    if (session && !session.revokedAt) {
      await this.repo.revokeSession(session.id);
    }
  }

  async getCurrentUser(userId: string): Promise<AuthenticatedUserResponse> {
    const user = await this.repo.findUserById(userId);
    if (!user || !user.isActive) {
      throw UnauthorizedError('User not found or inactive');
    }
    return this.formatUserResponse(user, user.organization);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput
  ): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw UnauthorizedError('User not found');
    }

    const isMatch = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!isMatch) {
      throw new AppError(400, ErrorCode.INVALID_CREDENTIALS, 'Current password is incorrect');
    }

    const newHash = await hashPassword(input.newPassword);
    await this.repo.updateUserPassword(userId, newHash);
    await this.repo.revokeAllUserSessions(userId);
  }

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.repo.findUserByEmail(normalizedEmail);

    let resetToken: string | undefined;

    if (user && user.isActive) {
      const { rawToken, tokenHash } = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.repo.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      if (env.NODE_ENV !== 'production') {
        resetToken = rawToken;
      }
    }

    return {
      message: 'If an account exists with that email address, password reset instructions have been sent.',
      ...(resetToken ? { resetToken } : {}),
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    const tokenHash = hashToken(input.token);
    const resetRecord = await this.repo.findValidPasswordResetToken(tokenHash);

    if (!resetRecord) {
      throw BadRequestError('Invalid or expired password reset token');
    }

    const newHash = await hashPassword(input.newPassword);
    await this.repo.updateUserPassword(resetRecord.userId, newHash);
    await this.repo.markPasswordResetTokenUsed(resetRecord.id);
    await this.repo.revokeAllUserSessions(resetRecord.userId);

    return { message: 'Password has been reset successfully. Please log in with your new password.' };
  }

  private async issueSessionTokens(
    userId: string,
    role: any,
    organizationId: string,
    meta?: RequestClientMeta
  ): Promise<AuthTokens> {
    const { rawToken: refreshToken, tokenHash } = generateOpaqueToken();

    const refreshTtlMs = ms(env.REFRESH_TOKEN_TTL) || 7 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + refreshTtlMs);

    const session = await this.repo.createSession({
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
    });

    const accessToken = createAccessToken({
      sub: userId,
      orgId: organizationId,
      role,
      sessionId: session.id,
    });

    return { accessToken, refreshToken };
  }

  private formatUserResponse(user: any, organization: any): AuthenticatedUserResponse {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone ?? null,
      skills: user.skills ?? [],
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        defaultCurrency: organization.defaultCurrency,
      },
    };
  }
}

export const authService = new AuthService();

