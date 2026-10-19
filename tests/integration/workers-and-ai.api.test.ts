import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  UserRole,
  WorkOrderCategory,
  WorkOrderPriority,
  AIAnalysisStatus,
  NotificationType,
  RecurringFaultStatus,
} from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../../src/database/prisma';
import { hashPassword } from '../../src/modules/auth/password.util';
import { createAccessToken, generateOpaqueToken } from '../../src/modules/auth/token.util';
import { aiTriageService } from '../../src/modules/ai-triage/ai-triage.service';
import { processSlaMonitoring } from '../../src/workers/sla-monitor.worker';
import { processRecurringFaultDetection } from '../../src/workers/recurring-fault.worker';
import { closeQueues } from '../../src/queues';

describe('Workers, OpenRouter AI Triage & Background Jobs Integration Tests', () => {
  const timestamp = Date.now();
  let orgId: string;
  let managerToken: string;
  let reporterToken: string;
  let managerId: string;
  let testLocationId: string;
  let testAssetId: string;
  let testWorkOrderId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: {
        name: `Workers Org ${timestamp}`,
        slug: `workers-org-${timestamp}`,
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

    const createUser = async (email: string, fullName: string, role: UserRole) => {
      const user = await prisma.user.create({
        data: {
          organizationId: orgId,
          email: email.toLowerCase(),
          normalizedEmail: email.toLowerCase(),
          fullName,
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

    const manager = await createUser(`manager_${timestamp}@example.com`, 'Manager User', UserRole.MANAGER);
    const reporter = await createUser(`reporter_${timestamp}@example.com`, 'Reporter User', UserRole.REPORTER);

    managerId = manager.user.id;
    managerToken = manager.token;
    reporterToken = reporter.token;

    const location = await prisma.location.create({
      data: {
        organizationId: orgId,
        name: 'Main Datacenter',
        building: 'Building B',
      },
    });
    testLocationId = location.id;

    const asset = await prisma.asset.create({
      data: {
        organizationId: orgId,
        locationId: testLocationId,
        assetCode: `CHILLER-${timestamp}`,
        name: 'Datacenter Primary Chiller',
        category: 'HVAC',
      },
    });
    testAssetId = asset.id;
  });

  afterAll(async () => {
    try {
      if (orgId) {
        await prisma.recurringFaultAlert.deleteMany({ where: { organizationId: orgId } });
        await prisma.notification.deleteMany({ where: { organizationId: orgId } });
        await prisma.workOrderAIAnalysis.deleteMany({ where: { organizationId: orgId } });
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
      await closeQueues();
      await prisma.$disconnect();
    } catch {
    }
  });

  describe('AI Triage Flow with OpenRouter Fallback', () => {
    it('creates a work order and initializes AI analysis in PENDING state', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({
          title: 'AC chiller compressor making violent grinding noise',
          description: 'Primary datacenter chiller is overheating and vibrating severely.',
          category: WorkOrderCategory.GENERAL,
          priority: WorkOrderPriority.MEDIUM,
          locationId: testLocationId,
          assetId: testAssetId,
        });

      expect(res.status).toBe(201);
      testWorkOrderId = res.body.data.id;

      const analysis = await prisma.workOrderAIAnalysis.findUnique({
        where: { workOrderId: testWorkOrderId },
      });

      expect(analysis).toBeDefined();
      expect(analysis?.status).toBe(AIAnalysisStatus.PENDING);
    });

    it('executes AI triage and updates analysis with suggestions and safety flags', async () => {
      const result = await aiTriageService.runTriage(testWorkOrderId, orgId);

      expect(result.status).toBe(AIAnalysisStatus.COMPLETED);
      expect(result.suggestedCategory).toBe(WorkOrderCategory.HVAC);
      expect(result.suggestedPriority).toBe(WorkOrderPriority.HIGH);
      expect(result.summary).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);

      const notification = await prisma.notification.findFirst({
        where: {
          workOrderId: testWorkOrderId,
          type: NotificationType.AI_ANALYSIS_COMPLETED,
        },
      });
      expect(notification).toBeDefined();
    });

    it('retrieves completed AI analysis via API', async () => {
      const res = await request(app)
        .get(`/api/v1/work-orders/${testWorkOrderId}/ai-analysis`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(AIAnalysisStatus.COMPLETED);
      expect(res.body.data.suggestedCategory).toBe(WorkOrderCategory.HVAC);
    });

    it('allows MANAGER to review and override AI suggestion', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/ai-analysis/review`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          accepted: false,
          overrideReason: 'Severe vibration indicates electrical motor coupling failure.',
          finalCategory: WorkOrderCategory.ELECTRICAL,
          finalPriority: WorkOrderPriority.CRITICAL,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(AIAnalysisStatus.REVIEWED);
      expect(res.body.data.accepted).toBe(false);
      expect(res.body.data.finalCategory).toBe(WorkOrderCategory.ELECTRICAL);
      expect(res.body.data.finalPriority).toBe(WorkOrderPriority.CRITICAL);

      const updatedWo = await prisma.workOrder.findUnique({
        where: { id: testWorkOrderId },
      });
      expect(updatedWo?.category).toBe(WorkOrderCategory.ELECTRICAL);
      expect(updatedWo?.priority).toBe(WorkOrderPriority.CRITICAL);
    });

    it('allows MANAGER to trigger AI retry', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/ai-analysis/retry`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const analysis = await prisma.workOrderAIAnalysis.findUnique({
        where: { workOrderId: testWorkOrderId },
      });
      expect(analysis?.status).toBe(AIAnalysisStatus.PENDING);
    });

    it('denies REPORTER from reviewing AI triage', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${testWorkOrderId}/ai-analysis/review`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({
          accepted: true,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('SLA Deadline Monitor Worker', () => {
    it('detects overdue work orders and creates notifications idempotently', async () => {
      const overdueWo = await prisma.workOrder.create({
        data: {
          organizationId: orgId,
          reporterId: managerId,
          locationId: testLocationId,
          title: 'Overdue water leak',
          description: 'Pipe leaking in server room',
          category: WorkOrderCategory.PLUMBING,
          priority: WorkOrderPriority.CRITICAL,
          dueAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });

      const firstRun = await processSlaMonitoring();
      expect(firstRun.overdueCount).toBeGreaterThanOrEqual(1);

      const notification = await prisma.notification.findFirst({
        where: {
          workOrderId: overdueWo.id,
          type: NotificationType.WORK_ORDER_OVERDUE,
        },
      });
      expect(notification).toBeDefined();

      const secondRun = await processSlaMonitoring();
      expect(secondRun.overdueCount).toBe(0);
    });
  });

  describe('Recurring-Fault Detection Worker', () => {
    it('detects 3 or more incidents on the same asset and generates active recurring fault alert', async () => {
      for (let i = 1; i <= 3; i++) {
        await prisma.workOrder.create({
          data: {
            organizationId: orgId,
            reporterId: managerId,
            locationId: testLocationId,
            assetId: testAssetId,
            title: `Chiller recurrent failure #${i}`,
            description: `Recurring leak on chiller unit #${i}`,
            category: WorkOrderCategory.HVAC,
            priority: WorkOrderPriority.HIGH,
          },
        });
      }

      const result = await processRecurringFaultDetection();
      expect(result.alertsCreated).toBeGreaterThanOrEqual(1);

      const alert = await prisma.recurringFaultAlert.findFirst({
        where: {
          organizationId: orgId,
          assetId: testAssetId,
          status: RecurringFaultStatus.ACTIVE,
        },
      });

      expect(alert).toBeDefined();
      expect(alert?.incidentCount).toBeGreaterThanOrEqual(3);
      expect(alert?.suggestedAction).toContain('Comprehensive diagnostic inspection');

      const faultNotification = await prisma.notification.findFirst({
        where: {
          organizationId: orgId,
          type: NotificationType.RECURRING_FAULT_DETECTED,
        },
      });
      expect(faultNotification).toBeDefined();
    });
  });
});

