import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/modules/auth/password.util';

describe('Password Utilities (Argon2id)', () => {
  it('hashes and correctly verifies passwords', async () => {
    const raw = 'SecureP@ssw0rd123';
    const hash = await hashPassword(raw);

    expect(typeof hash).toBe('string');
    expect(hash.startsWith('$argon2id$')).toBe(true);

    const isValid = await verifyPassword(hash, raw);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword(hash, 'WrongPassword123');
    expect(isInvalid).toBe(false);
  });
});

