import crypto from 'crypto';
import ms from 'ms';
import { env } from '../../config/env';
import type { TokenPayload } from './auth.types';

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function createAccessToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  ttl: string = env.ACCESS_TOKEN_TTL
): string {
  const iat = Math.floor(Date.now() / 1000);
  const durationMs = ms(ttl) || 900000;
  const exp = iat + Math.floor(durationMs / 1000);

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat, exp }));
  const signatureInput = `${header}.${body}`;

  const signature = crypto
    .createHmac('sha256', env.ACCESS_TOKEN_SECRET)
    .update(signatureInput)
    .digest('base64url');

  return `${signatureInput}.${signature}`;
}

export function verifyAccessToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const signatureInput = `${header}.${body}`;

  const expectedSignature = crypto
    .createHmac('sha256', env.ACCESS_TOKEN_SECRET)
    .update(signatureInput)
    .digest('base64url');

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const payload: TokenPayload = JSON.parse(base64UrlDecode(body));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

