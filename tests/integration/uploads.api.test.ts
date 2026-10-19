import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { hashPassword } from '../../src/modules/auth/password.util';
import { createAccessToken, generateOpaqueToken } from '../../src/modules/auth/token.util';

describe('Work Order Images & Uploads Integration Tests', () => {
  const timestamp = Date.now();
  let orgId: string;
  let managerToken: string;
  let reporterToken: string;
  let unauthorizedReporterToken: string;
  let testWorkOrderId: string;
  let uploadedImageId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: {
        name: `Uploads Org ${timestamp}`,
        slug: `uploads-org-${timestamp}`,
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

    const manager = await createUser(`manager_${timestamp}@example.com`, UserRole.MANAGER);
    const reporter = await createUser(`reporter_${timestamp}@example.com`, UserRole.REPORTER);
    const unauthReporter = await createUser(`unauth_${timestamp}@example.com`, UserRole.REPORTER);

    managerToken = manager.token;
    reporterToken = reporter.token;
    unauthorizedReporterToken = unauthReporter.token;

    const location = await prisma.location.create({
      data: {
        organizationId: orgId,
        name: 'Boiler Room',
      },
    });

    const workOrder = await prisma.workOrder.create({
      data: {
        organizationId: orgId,
        reporterId: reporter.user.id,
        locationId: location.id,
        title: 'Broken steam valve',
        description: 'Steam leaking from primary joint',
      },
    });
    testWorkOrderId = workOrder.id;
  });

  afterAll(async () => {
    try {
      if (orgId) {
        await prisma.workOrderImage.deleteMany({ where: { organizationId: orgId } });
        await prisma.workOrder.deleteMany({ where: { organizationId: orgId } });
        await prisma.location.deleteMany({ where: { organizationId: orgId } });
        await prisma.session.deleteMany({ where: { user: { organizationId: orgId } } });
        await prisma.user.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
      await prisma.$disconnect();
    } catch {
    }
  });

  it('allows reporter to upload an image to their own work order', async () => {
    const res = await request(app)
      .post(`/api/v1/work-orders/${testWorkOrderId}/images`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
        format: 'jpg',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.workOrderId).toBe(testWorkOrderId);
    expect(res.body.data.secureUrl).toBeDefined();
    uploadedImageId = res.body.data.id;
  });

  it('denies unrelated reporter from uploading to someone else work order', async () => {
    const res = await request(app)
      .post(`/api/v1/work-orders/${testWorkOrderId}/images`)
      .set('Authorization', `Bearer ${unauthorizedReporterToken}`)
      .send({
        image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
      });

    expect(res.status).toBe(403);
  });

  it('lists uploaded images for work order', async () => {
    const res = await request(app)
      .get(`/api/v1/work-orders/${testWorkOrderId}/images`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].id).toBe(uploadedImageId);
  });

  it('allows manager to delete work order image', async () => {
    const res = await request(app)
      .delete(`/api/v1/work-orders/${testWorkOrderId}/images/${uploadedImageId}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(204);

    const listRes = await request(app)
      .get(`/api/v1/work-orders/${testWorkOrderId}/images`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(listRes.body.data.length).toBe(0);
  });
});

