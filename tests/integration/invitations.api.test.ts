import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole, InvitationStatus } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { hashPassword } from '../../src/modules/auth/password.util';
import { createAccessToken, generateOpaqueToken } from '../../src/modules/auth/token.util';

describe('Invitations API Integration Tests', () => {
  const timestamp = Date.now();
  let orgId: string;
  let adminToken: string;
  let reporterToken: string;
  let rawInviteToken: string;
  let inviteId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: {
        name: `Invites Org ${timestamp}`,
        slug: `invites-org-${timestamp}`,
      },
    });
    orgId = org.id;

    const passwordHash = await hashPassword('SecurePass123!');

    const createUser = async (email: string, role: UserRole) => {
      const user = await prisma.user.create({
        data: {
          organizationId: orgId,
          email: email.toLowerCase(),
          normalizedEmail: email.toLowerCase(),
          fullName: 'Test User',
          passwordHash,
          role,
          isActive: true,
        },
      });

      const { tokenHash } = generateOpaqueToken();
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const token = createAccessToken({
        sub: user.id,
        orgId: user.organizationId,
        role: user.role,
        sessionId: session.id,
      });

      return { user, token };
    };

    const admin = await createUser(`admin_${timestamp}@example.com`, UserRole.ADMIN);
    const reporter = await createUser(`reporter_${timestamp}@example.com`, UserRole.REPORTER);

    adminToken = admin.token;
    reporterToken = reporter.token;
  });

  afterAll(async () => {
    try {
      if (orgId) {
        await prisma.invitation.deleteMany({ where: { organizationId: orgId } });
        await prisma.session.deleteMany({ where: { user: { organizationId: orgId } } });
        await prisma.user.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
      await prisma.$disconnect();
    } catch {
    }
  });

  it('allows ADMIN to create an invitation for a new technician', async () => {
    const res = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `newtech_${timestamp}@example.com`,
        role: UserRole.TECHNICIAN,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invitation.email).toBe(`newtech_${timestamp}@example.com`);
    expect(res.body.data.rawToken).toBeDefined();

    rawInviteToken = res.body.data.rawToken;
    inviteId = res.body.data.invitation.id;
  });

  it('denies REPORTER from creating invitations', async () => {
    const res = await request(app)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        email: `another_${timestamp}@example.com`,
        role: UserRole.REPORTER,
      });

    expect(res.status).toBe(403);
  });

  it('lists pending invitations for organization', async () => {
    const res = await request(app)
      .get('/api/v1/invitations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((i: { id: string }) => i.id === inviteId)).toBe(true);
  });

  it('publicly verifies valid invitation token', async () => {
    const res = await request(app).get(`/api/v1/invitations/verify/${rawInviteToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(`newtech_${timestamp}@example.com`);
    expect(res.body.data.role).toBe(UserRole.TECHNICIAN);
    expect(res.body.data.organization.id).toBe(orgId);
  });

  it('publicly accepts invitation and returns authenticated user session', async () => {
    const res = await request(app)
      .post('/api/v1/invitations/accept')
      .send({
        token: rawInviteToken,
        fullName: 'New Hired Technician',
        password: 'ValidPassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(`newtech_${timestamp}@example.com`);
    expect(res.body.data.user.role).toBe(UserRole.TECHNICIAN);
    expect(res.body.data.accessToken).toBeDefined();

    const inviteRecord = await prisma.invitation.findUnique({ where: { id: inviteId } });
    expect(inviteRecord?.status).toBe(InvitationStatus.ACCEPTED);
  });

  it('rejects already accepted invitation token', async () => {
    const res = await request(app).get(`/api/v1/invitations/verify/${rawInviteToken}`);
    expect(res.status).toBe(400);
  });
});

