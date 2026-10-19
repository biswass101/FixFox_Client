import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  resetPasswordSchema,
} from '../../src/modules/auth/auth.schemas';

describe('Auth Validation Schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid registration input', () => {
      const valid = {
        organizationName: 'Acme Facilities Ltd',
        email: 'Admin@Acme.Com',
        fullName: 'Jane Doe',
        password: 'Password123!',
      };

      const result = registerSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('admin@acme.com');
      }
    });

    it('rejects weak passwords missing required character classes', () => {
      const noUpper = {
        organizationName: 'Acme',
        email: 'test@acme.com',
        fullName: 'Jane',
        password: 'password123',
      };
      expect(registerSchema.safeParse(noUpper).success).toBe(false);

      const noNumber = {
        organizationName: 'Acme',
        email: 'test@acme.com',
        fullName: 'Jane',
        password: 'PasswordXYZ',
      };
      expect(registerSchema.safeParse(noNumber).success).toBe(false);

      const tooShort = {
        organizationName: 'Acme',
        email: 'test@acme.com',
        fullName: 'Jane',
        password: 'Pass1',
      };
      expect(registerSchema.safeParse(tooShort).success).toBe(false);
    });

    it('rejects invalid email formats', () => {
      const invalid = {
        organizationName: 'Acme',
        email: 'not-an-email',
        fullName: 'Jane',
        password: 'Password123',
      };
      expect(registerSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('normalizes email to lowercase and trimmed', () => {
      const input = {
        email: '  User@Domain.Com  ',
        password: 'AnyPassword123',
      };
      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@domain.com');
      }
    });
  });

  describe('changePasswordSchema & resetPasswordSchema', () => {
    it('validates change password payload', () => {
      expect(
        changePasswordSchema.safeParse({
          currentPassword: 'OldPassword1',
          newPassword: 'NewPassword2',
        }).success
      ).toBe(true);
    });

    it('validates reset password payload', () => {
      expect(
        resetPasswordSchema.safeParse({
          token: 'some-token',
          newPassword: 'NewPassword2',
        }).success
      ).toBe(true);
    });
  });
});

