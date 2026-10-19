import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole, NotificationType } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { hashPassword } from '../../src/modules/auth/password.util';
import { createAccessToken, generateOpaqueToken } from '../../src/modules/auth/token.util';

describe('Notifications API Integration Tests', () => {
  const timestamp = Date.now();
  let orgId: string;
  let userToken: string;
  let userId: string;
  let testNotificationId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: {
        name: `Notif Org ${timestamp}`,
        slug: `notif-org-${timestamp}`,
      },
    });
    orgId = org.id;

    const passwordHash = await hashPassword('SecurePass123!');

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: `notif_${timestamp}@example.com`,
        normalizedEmail: `notif_${timestamp}@example.com`,
        fullName: 'Notification Test User',
        passwordHash,
        role: UserRole.MANAGER,
        isActive: true,
      },
    });
    userId = user.id;

    const { tokenHash } = generateOpaqueToken();
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    userToken = createAccessToken({
      sub: user.id,
      orgId: user.organizationId,
      role: user.role,
      sessionId: session.id,
    });

    const n1 = await prisma.notification.create({
      data: {
        organizationId: orgId,
        recipientId: userId,
        type: NotificationType.WORK_ORDER_ASSIGNED,
        title: 'Task Assigned',
        body: 'You have been assigned a task.',
      },
    });
    testNotificationId = n1.id;

    await prisma.notification.create({
      data: {
        organizationId: orgId,
        recipientId: userId,
        type: NotificationType.DEADLINE_APPROACHING,
        title: 'Task Approaching Deadline',
        body: 'Deadline in 30 minutes.',
      },
    });
  });

  afterAll(async () => {
    try {
      if (orgId) {
        await prisma.notification.deleteMany({ where: { organizationId: orgId } });
        await prisma.session.deleteMany({ where: { user: { organizationId: orgId } } });
        await prisma.user.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
      await prisma.$disconnect();
    } catch {
    }
  });

  it('lists notifications for current authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.meta.pagination.total).toBeGreaterThanOrEqual(2);
  });

  it('retrieves unread notification count', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(2);
  });

  it('marks a single notification as read', async () => {
    const res = await request(app)
      .patch(`/api/v1/notifications/${testNotificationId}/read`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.readAt).toBeDefined();

    const countRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${userToken}`);

    expect(countRes.body.data.unreadCount).toBe(1);
  });

  it('marks all notifications as read', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/mark-all-read')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBeGreaterThanOrEqual(1);

    const countRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${userToken}`);

    expect(countRes.body.data.unreadCount).toBe(0);
  });
});

