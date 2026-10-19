import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole, WorkOrderCategory, WorkOrderPriority, WorkOrderStatus, CostType } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { hashPassword } from '../../src/modules/auth/password.util';
import { createAccessToken, generateOpaqueToken } from '../../src/modules/auth/token.util';

describe('Work Orders, Locations & Assets Integration Tests', () => {
  const timestamp = Date.now();
  let orgId: string;
  let adminToken: string;
  let managerToken: string;
  let technicianToken: string;
  let reporterToken: string;
  let adminId: string;
  let managerId: string;
  let technicianId: string;
  let reporterId: string;

  let testLocationId: string;
  let testAssetId: string;
  let testWorkOrderId: string;
  let currentWorkOrderVersion: number = 1;

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: {
        name: `Operations Org ${timestamp}`,
        slug: `ops-org-${timestamp}`,
      },
    });
    orgId = org.id;

    await prisma.slaConfig.create({
      data: {
        organizationId: orgId,
        criticalResponseMinutes: 15,
        highResponseMinutes: 120,
        mediumResponseMinutes: 480,
        lowResponseMinutes: 2880,
      },
    });

    const passwordHash = await hashPassword('SecurePass123!');

    const createUserWithToken = async (email: string, fullName: string, role: UserRole, skills: string[] = []) => {
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

      const { rawToken, tokenHash } = generateOpaqueToken();
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

      return { user, token, rawToken };
    };

    const admin = await createUserWithToken(`admin_${timestamp}@example.com`, 'Admin User', UserRole.ADMIN);
    const manager = await createUserWithToken(`manager_${timestamp}@example.com`, 'Manager User', UserRole.MANAGER);
    const technician = await createUserWithToken(`tech_${timestamp}@example.com`, 'Tech User', UserRole.TECHNICIAN, ['HVAC', 'Electrical']);
    const reporter = await createUserWithToken(`reporter_${timestamp}@example.com`, 'Reporter User', UserRole.REPORTER);

    adminId = admin.user.id;
    managerId = manager.user.id;
    technicianId = technician.user.id;
    reporterId = reporter.user.id;

    adminToken = admin.token;
    managerToken = manager.token;
    technicianToken = technician.token;
    reporterToken = reporter.token;
  });

  afterAll(async () => {
    try {
      if (orgId) {
        await prisma.workOrderCost.deleteMany({ where: { organizationId: orgId } });
        await prisma.workNote.deleteMany({ where: { organizationId: orgId } });
        await prisma.workOrderStatusHistory.deleteMany({ where: { organizationId: orgId } });
        await prisma.workOrderAssignment.deleteMany({ where: { organizationId: orgId } });
        await prisma.workOrder.deleteMany({ where: { organizationId: orgId } });
        await prisma.asset.deleteMany({ where: { organizationId: orgId } });
        await prisma.location.deleteMany({ where: { organizationId: orgId } });
        await prisma.session.deleteMany({ where: { user: { organizationId: orgId } } });
        await prisma.user.deleteMany({ where: { organizationId: orgId } });
        await prisma.slaConfig.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
      await prisma.$disconnect();
    } catch {
    }
  });

  describe('Locations API', () => {
    it('creates a new location as ADMIN', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Main Facility',
          building: 'Tower A',
          floor: 'Level 3',
          room: 'Server Room 301',
          description: 'Primary datacenter and network operations',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Main Facility');
      expect(res.body.data.organizationId).toBe(orgId);
      testLocationId = res.body.data.id;
    });

    it('denies location creation for REPORTER role', async () => {
      const res = await request(app)
        .post('/api/v1/locations')
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({
          name: 'Unauthorized Location',
        });

      expect(res.status).toBe(403);
    });

    it('lists locations with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/locations')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((l: { id: string }) => l.id === testLocationId)).toBe(true);
      expect(res.body.meta.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('updates location details as MANAGER', async () => {
      const res = await request(app)
        .patch(`/api/v1/locations/${testLocationId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          room: 'Server Room 302',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.room).toBe('Server Room 302');
    });
  });

  describe('Assets API', () => {
    it('creates an asset as MANAGER', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          locationId: testLocationId,
          assetCode: `HVAC-${timestamp}`,
          name: 'Central Chiller Unit',
          category: 'HVAC',
          manufacturer: 'Carrier',
          modelNumber: 'AquaEdge 19DV',
          condition: 'GOOD',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assetCode).toBe(`HVAC-${timestamp}`);
      testAssetId = res.body.data.id;
    });

    it('rejects duplicate assetCode within the same organization', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          locationId: testLocationId,
          assetCode: `HVAC-${timestamp}`,
          name: 'Duplicate Chiller',
          category: 'HVAC',
        });

      expect(res.status).toBe(409);
    });

    it('retrieves asset details by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/assets/${testAssetId}`)
        .set('Authorization', `Bearer ${reporterToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testAssetId);
      expect(res.body.data.name).toBe('Central Chiller Unit');
      expect(res.body.data.location.name).toBe('Main Facility');
    });

    it('updates asset details', async () => {
      const res = await request(app)
        .patch(`/api/v1/assets/${testAssetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          condition: 'FAIR',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.condition).toBe('FAIR');
    });
  });

  describe('Technicians API', () => {
    it('lists available technicians for MANAGER', async () => {
      const res = await request(app)
        .get('/api/v1/technicians')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const tech = res.body.data.find((t: { id: string }) => t.id === technicianId);
      expect(tech).toBeDefined();
      expect(tech.skills).toContain('HVAC');
      expect(tech).toHaveProperty('activeJobCount');
    });

    it('denies technician listing for REPORTER', async () => {
      const res = await request(app)
        .get('/api/v1/technicians')
        .set('Authorization', `Bearer ${reporterToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Work Orders Lifecycle & Operations', () => {
    it('creates a work order as REPORTER with automatic SLA computation', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({
          title: 'AC leaking water on server rack',
          description: 'Water condensate is dripping near rack B-4. Needs urgent maintenance.',
          category: WorkOrderCategory.HVAC,
          priority: WorkOrderPriority.HIGH,
          locationId: testLocationId,
          assetId: testAssetId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(WorkOrderStatus.OPEN);
      expect(res.body.data.reporterId).toBe(reporterId);
      expect(res.body.data.dueAt).toBeDefined();
      expect(res.body.data.version).toBe(1);

      testWorkOrderId = res.body.data.id;
      currentWorkOrderVersion = res.body.data.version;
    });

    it('allows MANAGER to assign a technician to the work order', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/assign`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          technicianId,
          reason: 'Lead HVAC technician dispatch',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(WorkOrderStatus.ASSIGNED);
      expect(res.body.data.assigneeId).toBe(technicianId);
      expect(res.body.data.assignedAt).toBeDefined();
      currentWorkOrderVersion = res.body.data.version;
    });

    it('allows assigned TECHNICIAN to start the work order', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/status`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          status: WorkOrderStatus.IN_PROGRESS,
          reason: 'Diagnosing chiller condensate line',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(WorkOrderStatus.IN_PROGRESS);
      expect(res.body.data.startedAt).toBeDefined();
      currentWorkOrderVersion = res.body.data.version;
    });

    it('manages work notes with internal visibility scoping', async () => {
      const internalRes = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/notes`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          body: 'Internal check: Compressor coil rusted, replacement needed soon.',
          isInternal: true,
        });
      expect(internalRes.status).toBe(201);

      const publicRes = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/notes`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          body: 'Cleared condensate tray blockage and installed temporary drain pan.',
          isInternal: false,
        });
      expect(publicRes.status).toBe(201);

      const reporterNotesRes = await request(app)
        .get(`/api/v1/work-orders/${testWorkOrderId}/notes`)
        .set('Authorization', `Bearer ${reporterToken}`);

      expect(reporterNotesRes.status).toBe(200);
      expect(reporterNotesRes.body.data.length).toBe(1);
      expect(reporterNotesRes.body.data[0].isInternal).toBe(false);

      const managerNotesRes = await request(app)
        .get(`/api/v1/work-orders/${testWorkOrderId}/notes`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(managerNotesRes.status).toBe(200);
      expect(managerNotesRes.body.data.length).toBe(2);
    });

    it('records and calculates work order costs authoritatively', async () => {
      const partsRes = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/costs`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          type: CostType.PARTS,
          description: 'PVC Drain Pipe & Fittings',
          quantity: 2,
          unitCost: 75.5,
          currency: 'BDT',
        });

      expect(partsRes.status).toBe(201);
      expect(Number(partsRes.body.data.totalCost)).toBe(151);

      const laborRes = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/costs`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          type: CostType.LABOR,
          description: 'Diagnostic & plumbing repair hours',
          quantity: 1.5,
          unitCost: 100,
          laborHours: 1.5,
          currency: 'BDT',
        });

      expect(laborRes.status).toBe(201);
      expect(Number(laborRes.body.data.totalCost)).toBe(150);

      const listCostsRes = await request(app)
        .get(`/api/v1/work-orders/${testWorkOrderId}/costs`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(listCostsRes.status).toBe(200);
      expect(listCostsRes.body.data.costs.length).toBe(2);
      expect(Number(listCostsRes.body.data.totalCost)).toBe(301);
    });

    it('enforces optimistic concurrency control on concurrent modifications', async () => {
      const staleVersionRes = await request(app)
        .patch(`/api/v1/work-orders/${testWorkOrderId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Stale update attempt',
          version: 1,
        });

      expect(staleVersionRes.status).toBe(409);

      const currentWoRes = await request(app)
        .get(`/api/v1/work-orders/${testWorkOrderId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      const latestVersion = currentWoRes.body.data.version;

      const validUpdateRes = await request(app)
        .patch(`/api/v1/work-orders/${testWorkOrderId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'AC dripping water - Serviced and repaired',
          version: latestVersion,
        });

      expect(validUpdateRes.status).toBe(200);
      expect(validUpdateRes.body.data.title).toBe('AC dripping water - Serviced and repaired');
      expect(validUpdateRes.body.data.version).toBe(latestVersion + 1);
    });

    it('allows assigned TECHNICIAN to resolve work order with resolution summary', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/resolve`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          resolutionSummary: 'Cleaned condensation drainage pump and tested line pressure. No further leakage.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(WorkOrderStatus.RESOLVED);
      expect(res.body.data.resolvedAt).toBeDefined();
      expect(res.body.data.resolutionSummary).toContain('Cleaned condensation');
    });

    it('denies TECHNICIAN from closing work order', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/close`)
        .set('Authorization', `Bearer ${technicianToken}`);

      expect(res.status).toBe(403);
    });

    it('allows MANAGER to close resolved work order', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/close`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(WorkOrderStatus.CLOSED);
      expect(res.body.data.closedAt).toBeDefined();
    });

    it('returns complete audit history for work order transitions', async () => {
      const res = await request(app)
        .get(`/api/v1/work-orders/${testWorkOrderId}/history`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    });
  });
});
