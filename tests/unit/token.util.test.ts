import { describe, it, expect } from 'vitest';
import {
  createAccessToken,
  verifyAccessToken,
  hashToken,
  generateOpaqueToken,
} from '../../src/modules/auth/token.util';
import { UserRole } from '@prisma/client';

describe('Token Utilities', () => {
  const samplePayload = {
    sub: '11111111-1111-1111-1111-111111111111',
    orgId: '22222222-2222-2222-2222-222222222222',
    role: UserRole.ADMIN,
    sessionId: '33333333-3333-3333-3333-333333333333',
  };

  it('creates and verifies a valid access token', () => {
    const token = createAccessToken(samplePayload, '15m');
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const verified = verifyAccessToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(samplePayload.sub);
    expect(verified?.orgId).toBe(samplePayload.orgId);
    expect(verified?.role).toBe(samplePayload.role);
    expect(verified?.sessionId).toBe(samplePayload.sessionId);
    expect(verified?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects an expired token', () => {
    const expiredToken = createAccessToken(samplePayload, '-1s');
    const verified = verifyAccessToken(expiredToken);
    expect(verified).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = createAccessToken(samplePayload, '15m');
    const [header, body, sig] = token.split('.');
    const tamperedSig = sig.slice(0, -2) + (sig.endsWith('a') ? 'b' : 'a');
    const tamperedToken = `${header}.${body}.${tamperedSig}`;

    const verified = verifyAccessToken(tamperedToken);
    expect(verified).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyAccessToken('not-a-token')).toBeNull();
    expect(verifyAccessToken('header.body')).toBeNull();
    expect(verifyAccessToken('')).toBeNull();
  });

  it('generates unique opaque tokens with matching SHA-256 hashes', () => {
    const token1 = generateOpaqueToken();
    const token2 = generateOpaqueToken();

    expect(token1.rawToken).not.toBe(token2.rawToken);
    expect(token1.rawToken.length).toBe(64);
    expect(token1.tokenHash).toBe(hashToken(token1.rawToken));
  });
});

