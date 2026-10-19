import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole, WorkOrderCategory, WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { hashPassword } from '../../src/modules/auth/password.util';
import { createAccessToken, generateOpaqueToken } from '../../src/modules/auth/token.util';

describe('Security & Multi-Tenant Isolation Regression Tests', () => {
  const timestamp = Date.now();
  let orgAId: string;
  let orgBId: string;

  let orgAAdminToken: string;
  let orgAReporterToken: string;
  let orgATechToken: string;

  let orgBAdminToken: string;
  let orgBReporterToken: string;

  let orgAWorkOrderId: string;
  let orgALocationId: string;
  let orgAAssetId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const orgA = await prisma.organization.create({
      data: { name: `Tenant Alpha ${timestamp}`, slug: `tenant-alpha-${timestamp}` },
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: { name: `Tenant Beta ${timestamp}`, slug: `tenant-beta-${timestamp}` },
    });
    orgBId = orgB.id;

    const passwordHash = await hashPassword('SecurePass123!');

    const createUserWithToken = async (orgId: string, email: string, role: UserRole) => {
      const user = await prisma.user.create({
        data: {
          organizationId: orgId,
          email: email.toLowerCase(),
          normalizedEmail: email.toLowerCase(),
          fullName: `User ${email}`,
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

    const adminA = await createUserWithToken(orgAId, `admin_a_${timestamp}@example.com`, UserRole.ADMIN);
    const reporterA = await createUserWithToken(orgAId, `reporter_a_${timestamp}@example.com`, UserRole.REPORTER);
    const techA = await createUserWithToken(orgAId, `tech_a_${timestamp}@example.com`, UserRole.TECHNICIAN);

    const adminB = await createUserWithToken(orgBId, `admin_b_${timestamp}@example.com`, UserRole.ADMIN);
    const reporterB = await createUserWithToken(orgBId, `reporter_b_${timestamp}@example.com`, UserRole.REPORTER);

    orgAAdminToken = adminA.token;
    orgAReporterToken = reporterA.token;
    orgATechToken = techA.token;

    orgBAdminToken = adminB.token;
    orgBReporterToken = reporterB.token;

    const locA = await prisma.location.create({
      data: { organizationId: orgAId, name: 'Alpha Main Hall' },
    });
    orgALocationId = locA.id;

    const assetA = await prisma.asset.create({
      data: {
        organizationId: orgAId,
        locationId: locA.id,
        assetCode: `ALPHA-CHILLER-${timestamp}`,
        name: 'Alpha Primary Chiller',
        category: 'HVAC',
      },
    });
    orgAAssetId = assetA.id;

    const woA = await prisma.workOrder.create({
      data: {
        organizationId: orgAId,
        reporterId: reporterA.user.id,
        locationId: locA.id,
        assetId: assetA.id,
        title: 'Alpha confidential repair',
        description: 'Critical internal machinery repair',
        category: WorkOrderCategory.HVAC,
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.OPEN,
      },
    });
    orgAWorkOrderId = woA.id;
  });

  afterAll(async () => {
    try {
      for (const orgId of [orgAId, orgBId]) {
        if (orgId) {
          await prisma.workOrderAIAnalysis.deleteMany({ where: { organizationId: orgId } });
          await prisma.workOrderCost.deleteMany({ where: { organizationId: orgId } });
          await prisma.workNote.deleteMany({ where: { organizationId: orgId } });
          await prisma.workOrderStatusHistory.deleteMany({ where: { organizationId: orgId } });
          await prisma.workOrderAssignment.deleteMany({ where: { organizationId: orgId } });
          await prisma.workOrderImage.deleteMany({ where: { organizationId: orgId } });
          await prisma.workOrder.deleteMany({ where: { organizationId: orgId } });
          await prisma.asset.deleteMany({ where: { organizationId: orgId } });
          await prisma.location.deleteMany({ where: { organizationId: orgId } });
          await prisma.invitation.deleteMany({ where: { organizationId: orgId } });
          await prisma.notification.deleteMany({ where: { organizationId: orgId } });
          await prisma.session.deleteMany({ where: { user: { organizationId: orgId } } });
          await prisma.user.deleteMany({ where: { organizationId: orgId } });
          await prisma.organization.delete({ where: { id: orgId } });
        }
      }
      await prisma.$disconnect();
    } catch {
    }
  });

  describe('Multi-Tenant Data Isolation', () => {
    it('prevents Tenant B admin from retrieving Tenant A work orders', async () => {
      const res = await request(app)
        .get(`/api/v1/work-orders/${orgAWorkOrderId}`)
        .set('Authorization', `Bearer ${orgBAdminToken}`);

      expect(res.status).toBe(404);
    });

    it('prevents Tenant B admin from updating Tenant A work order', async () => {
      const res = await request(app)
        .patch(`/api/v1/work-orders/${orgAWorkOrderId}`)
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .send({
          title: 'Hacked title by foreign tenant',
          version: 1,
        });

      expect(res.status).toBe(404);
    });

    it('prevents Tenant B from modifying Tenant A work order status', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${orgAWorkOrderId}/status`)
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .send({
          status: WorkOrderStatus.IN_PROGRESS,
        });

      expect(res.status).toBe(404);
    });

    it('prevents Tenant B from adding notes to Tenant A work order', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${orgAWorkOrderId}/notes`)
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .send({
          body: 'Unauthorized foreign tenant note',
        });

      expect(res.status).toBe(404);
    });

    it('prevents Tenant B from reading Tenant A locations', async () => {
      const res = await request(app)
        .get(`/api/v1/locations/${orgALocationId}`)
        .set('Authorization', `Bearer ${orgBAdminToken}`);

      expect(res.status).toBe(404);
    });

    it('prevents Tenant B from updating Tenant A assets', async () => {
      const res = await request(app)
        .patch(`/api/v1/assets/${orgAAssetId}`)
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .send({
          name: 'Tampered Asset Name',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('Role-Based Privilege Enforcement', () => {
    it('denies REPORTER from assigning technicians', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${orgAWorkOrderId}/assign`)
        .set('Authorization', `Bearer ${orgAReporterToken}`)
        .send({
          technicianId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(403);
    });

    it('denies REPORTER from closing work orders', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${orgAWorkOrderId}/close`)
        .set('Authorization', `Bearer ${orgAReporterToken}`);

      expect(res.status).toBe(403);
    });

    it('denies TECHNICIAN from closing work orders', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${orgAWorkOrderId}/close`)
        .set('Authorization', `Bearer ${orgATechToken}`);

      expect(res.status).toBe(403);
    });

    it('denies REPORTER from creating locations', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${orgAReporterToken}`)
        .send({
          name: 'Unauthorized Location',
        });

      expect(res.status).toBe(403);
    });

    it('denies REPORTER from creating assets', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${orgAReporterToken}`)
        .send({
          name: 'Unauthorized Asset',
          assetCode: `ILLEGAL-${timestamp}`,
          locationId: orgALocationId,
          category: 'HVAC',
        });

      expect(res.status).toBe(403);
    });

    it('denies REPORTER from viewing technicians list', async () => {
      const res = await request(app)
        .get('/api/v1/technicians')
        .set('Authorization', `Bearer ${orgAReporterToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Authentication & Session Hardening', () => {
    it('rejects tampered JWT signature with 401', async () => {
      const parts = orgAAdminToken.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.tampered_signature_payload`;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
    });

    it('rejects malformed authorization header with 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'InvalidFormatHeader');

      expect(res.status).toBe(401);
    });

    it('rejects requests with missing credentials with 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('Input Sanitization & Injection Defense', () => {
    it('resists SQL injection in location search queries safely', async () => {
      const maliciousPayload = "' OR '1'='1; DROP TABLE users; --";

      const res = await request(app)
        .get('/api/v1/locations')
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .query({ search: maliciousPayload });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const usersExist = await prisma.user.count({ where: { organizationId: orgAId } });
      expect(usersExist).toBeGreaterThan(0);
    });

    it('rejects invalid non-UUID path parameters with validation error', async () => {
      const res = await request(app)
        .get('/api/v1/assets/not-a-valid-uuid')
        .set('Authorization', `Bearer ${orgAAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
