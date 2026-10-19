import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole, WorkOrderStatus, WorkOrderCategory, WorkOrderPriority, CostType } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { hashPassword } from '../../src/modules/auth/password.util';
import { createAccessToken, generateOpaqueToken } from '../../src/modules/auth/token.util';

describe('Analytics & Documentation Integration Tests', () => {
  const timestamp = Date.now();
  let orgId: string;
  let managerToken: string;
  let reporterToken: string;
  let techUser: any;

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: {
        name: `Analytics Org ${timestamp}`,
        slug: `analytics-org-${timestamp}`,
      },
    });
    orgId = org.id;

    const passwordHash = await hashPassword('SecurePass123!');

    const createUser = async (email: string, fullName: string, role: UserRole, skills: string[] = []) => {
      const user = await prisma.user.create({
        data: {
          organizationId: orgId,
          email: email.toLowerCase(),
          normalizedEmail: email.toLowerCase(),
          fullName,
          passwordHash,
          role,
          skills,
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

    const manager = await createUser(`manager_${timestamp}@example.com`, 'Analytics Manager', UserRole.MANAGER);
    const reporter = await createUser(`reporter_${timestamp}@example.com`, 'Analytics Reporter', UserRole.REPORTER);
    techUser = await createUser(`tech_${timestamp}@example.com`, 'Analytics Tech', UserRole.TECHNICIAN, ['HVAC']);

    managerToken = manager.token;
    reporterToken = reporter.token;

    const loc = await prisma.location.create({
      data: {
        organizationId: orgId,
        name: 'Analytics Test Location',
      },
    });

    const wo1 = await prisma.workOrder.create({
      data: {
        organizationId: orgId,
        reporterId: reporter.user.id,
        assigneeId: techUser.user.id,
        locationId: loc.id,
        title: 'Resolved Electrical Issue',
        description: 'Breaker tripped on main line',
        category: WorkOrderCategory.ELECTRICAL,
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.RESOLVED,
        createdAt: new Date(Date.now() - 4 * 3600000),
        resolvedAt: new Date(Date.now() - 2 * 3600000),
      },
    });

    await prisma.workOrderCost.create({
      data: {
        organizationId: orgId,
        workOrderId: wo1.id,
        createdById: techUser.user.id,
        type: CostType.PARTS,
        description: 'Replacement 20A Breaker',
        quantity: 1,
        unitCost: 85.5,
        totalCost: 85.5,
      },
    });

    await prisma.workOrder.create({
      data: {
        organizationId: orgId,
        reporterId: reporter.user.id,
        assigneeId: techUser.user.id,
        locationId: loc.id,
        title: 'Open Plumbing Leak',
        description: 'Drain blocked in bathroom',
        category: WorkOrderCategory.PLUMBING,
        priority: WorkOrderPriority.MEDIUM,
        status: WorkOrderStatus.IN_PROGRESS,
        createdAt: new Date(),
        dueAt: new Date(Date.now() - 3600000),
      },
    });
  });

  afterAll(async () => {
    try {
      if (orgId) {
        await prisma.workOrderCost.deleteMany({ where: { organizationId: orgId } });
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

  it('retrieves analytics overview with status breakdown, MTTR and costs', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalWorkOrders).toBe(2);
    expect(res.body.data.countsByStatus.resolved).toBe(1);
    expect(res.body.data.countsByStatus.inProgress).toBe(1);
    expect(res.body.data.overdueCount).toBe(1);
    expect(res.body.data.totalMaintenanceCost).toBe(85.5);
    expect(res.body.data.meanTimeToResolveHours).toBeGreaterThan(0);
  });

  it('retrieves work order distribution by category', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/by-category')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((c: { category: string }) => c.category === 'ELECTRICAL')).toBe(true);
  });

  it('retrieves work order distribution by priority', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/by-priority')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((p: { priority: string }) => p.priority === 'HIGH')).toBe(true);
  });

  it('retrieves rolling creation and resolution trends', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/trends')
      .set('Authorization', `Bearer ${managerToken}`)
      .query({ days: 7 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(7);
  });

  it('retrieves technician performance metrics for MANAGER', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/technician-performance')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const tech = res.body.data.find((t: { id: string }) => t.id === techUser.user.id);
    expect(tech).toBeDefined();
    expect(tech.activeWorkOrders).toBe(1);
    expect(tech.completedWorkOrders).toBe(1);
  });

  it('denies REPORTER from accessing technician performance analytics', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/technician-performance')
      .set('Authorization', `Bearer ${reporterToken}`);

    expect(res.status).toBe(403);
  });

  it('serves OpenAPI 3.0 specification at /api/docs/json', async () => {
    const res = await request(app).get('/api/docs/json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.0');
    expect(res.body.info.title).toBe('FixFlow API');
  });
});

