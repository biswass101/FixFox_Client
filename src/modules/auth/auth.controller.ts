import { Request, Response, CookieOptions } from 'express';
import ms from 'ms';
import { env } from '../../config/env';
import { authService, AuthService } from './auth.service';
import { sendCreated, sendSuccess } from '../../common/utils/api-response';
import type { RequestClientMeta } from './auth.types';

function getClientMeta(req: Request): RequestClientMeta {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
  };
}

function getAccessCookieOptions(): CookieOptions {
  const maxAge = ms(env.ACCESS_TOKEN_TTL) || 15 * 60 * 1000;

  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
    ...(env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== 'localhost'
      ? { domain: env.COOKIE_DOMAIN }
      : {}),
  };
}

function getRefreshCookieOptions(): CookieOptions {
  const maxAge = ms(env.REFRESH_TOKEN_TTL) || 7 * 24 * 60 * 60 * 1000;

  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: `${env.API_PREFIX}/auth`,
    ...(env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== 'localhost'
      ? { domain: env.COOKIE_DOMAIN }
      : {}),
  };
}

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const meta = getClientMeta(req);
    const result = await this.service.register(req.body, meta);

    res.cookie('access_token', result.tokens.accessToken, getAccessCookieOptions());
    res.cookie('refresh_token', result.tokens.refreshToken, getRefreshCookieOptions());

    sendCreated(res, {
      user: result.user,
      accessToken: result.tokens.accessToken,
    });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const meta = getClientMeta(req);
    const result = await this.service.login(req.body, meta);

    res.cookie('access_token', result.tokens.accessToken, getAccessCookieOptions());
    res.cookie('refresh_token', result.tokens.refreshToken, getRefreshCookieOptions());

    sendSuccess(res, {
      user: result.user,
      accessToken: result.tokens.accessToken,
    });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const token =
      (req.cookies?.refresh_token as string | undefined) ||
      (req.body?.refreshToken as string | undefined);

    const meta = getClientMeta(req);
    const result = await this.service.refresh(token!, meta);

    res.cookie('access_token', result.tokens.accessToken, getAccessCookieOptions());
    res.cookie('refresh_token', result.tokens.refreshToken, getRefreshCookieOptions());

    sendSuccess(res, {
      accessToken: result.tokens.accessToken,
    });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const token =
      (req.cookies?.refresh_token as string | undefined) ||
      (req.body?.refreshToken as string | undefined);

    await this.service.logout(token);

    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: `${env.API_PREFIX}/auth` });

    sendSuccess(res, { message: 'Logged out successfully' });
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const user = await this.service.getCurrentUser(req.user!.userId);
    sendSuccess(res, user);
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    await this.service.changePassword(req.user!.userId, req.body);

    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: `${env.API_PREFIX}/auth` });

    sendSuccess(res, {
      message: 'Password changed successfully. Please log in again with your new password.',
    });
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.forgotPassword(req.body.email);
    sendSuccess(res, result);
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.resetPassword(req.body);
    sendSuccess(res, result);
  };
}

export const authController = new AuthController();

