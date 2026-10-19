import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/database/prisma';

describe('Auth API Integration Tests', () => {
  const timestamp = Date.now();
  const testUser = {
    organizationName: `Test Org ${timestamp}`,
    email: `admin_${timestamp}@example.com`,
    fullName: 'Test Admin',
    password: 'SecureP@ssword123',
  };

  let accessToken: string;
  let refreshTokenCookie: string;
  let accessTokenCookie: string;

  beforeAll(async () => {
    try {
      await prisma.$connect();
    } catch {
    }
  });

  afterAll(async () => {
    try {
      const user = await prisma.user.findFirst({
        where: { email: testUser.email.toLowerCase() },
      });
      if (user) {
        await prisma.session.deleteMany({ where: { userId: user.id } });
        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.slaConfig.deleteMany({ where: { organizationId: user.organizationId } });
        await prisma.organization.delete({ where: { id: user.organizationId } });
      }
      await prisma.$disconnect();
    } catch {
    }
  });

  it('POST /api/v1/auth/register - creates org, admin, and returns session cookies', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.data.user.organization.name).toBe(testUser.organizationName);
    expect(res.body.data).toHaveProperty('accessToken');

    const cookies = res.headers['set-cookie'] as string[];
    expect(cookies).toBeDefined();
    const accessCookie = cookies.find((c) => c.startsWith('access_token='));
    const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='));

    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
    expect(accessCookie).toContain('HttpOnly');

    accessToken = res.body.data.accessToken;
    accessTokenCookie = accessCookie!.split(';')[0];
    refreshTokenCookie = refreshCookie!.split(';')[0];
  });

  it('POST /api/v1/auth/register - rejects duplicate email with 409', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
  });

  it('POST /api/v1/auth/register - rejects invalid input with 422', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'A',
        email: 'invalid-email',
        fullName: '',
        password: 'weak',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/auth/login - authenticates user with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
    expect(res.body.data).toHaveProperty('accessToken');
  });

  it('POST /api/v1/auth/login - rejects incorrect password with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: 'IncorrectPassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /api/v1/auth/me - returns user profile with cookie auth', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [accessTokenCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testUser.email.toLowerCase());
  });

  it('GET /api/v1/auth/me - returns user profile with Bearer header', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testUser.email.toLowerCase());
  });

  it('GET /api/v1/auth/me - rejects request without credentials with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/v1/auth/refresh - rotates session and issues new access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshTokenCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');

    const cookies = res.headers['set-cookie'] as string[];
    expect(cookies).toBeDefined();
    const newRefreshCookie = cookies.find((c) => c.startsWith('refresh_token='));
    expect(newRefreshCookie).toBeDefined();

    refreshTokenCookie = newRefreshCookie!.split(';')[0];
  });

  it('POST /api/v1/auth/change-password - updates password and verifies new login', async () => {
    const newPassword = 'NewSecurePassword456!';

    const changeRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: testUser.password,
        newPassword,
      });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);

    const loginWithNew = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: newPassword,
      });

    expect(loginWithNew.status).toBe(200);
    expect(loginWithNew.body.success).toBe(true);
  });

  it('POST /api/v1/auth/logout - revokes session and clears cookies', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [refreshTokenCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const refreshAfterLogout = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshTokenCookie]);

    expect(refreshAfterLogout.status).toBe(401);
  });

  it('POST /api/v1/auth/forgot-password & /reset-password flow', async () => {
    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: testUser.email });

    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.success).toBe(true);

    const resetToken = forgotRes.body.data?.resetToken;
    if (resetToken) {
      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'BrandNewPassword789!',
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);

      const loginAfterReset = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'BrandNewPassword789!',
        });

      expect(loginAfterReset.status).toBe(200);
    }
  });
});

