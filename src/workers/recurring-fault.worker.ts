import { Worker, Job } from 'bullmq';
import { RecurringFaultStatus, NotificationType, UserRole } from '@prisma/client';
import { prisma } from '../database/prisma';
import { redisConnection } from '../queues/queue.config';
import { QUEUE_NAMES, RecurringFaultJobPayload } from '../queues/queue.types';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('RecurringFaultWorker');

export async function processRecurringFaultDetection(
  job?: Job<RecurringFaultJobPayload>
): Promise<{ alertsCreated: number; alertsUpdated: number }> {
  const windowDays = 30;
  const threshold = 3;
  const cutoffDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const organizationFilter = job?.data?.organizationId
    ? { id: job.data.organizationId }
    : { status: 'ACTIVE' as const };

  const organizations = await prisma.organization.findMany({
    where: organizationFilter,
    select: { id: true, name: true },
  });

  let alertsCreated = 0;
  let alertsUpdated = 0;

  for (const org of organizations) {
    const recentWorkOrders = await prisma.workOrder.findMany({
      where: {
        organizationId: org.id,
        createdAt: { gte: cutoffDate },
      },
      select: {
        id: true,
        assetId: true,
        locationId: true,
        category: true,
        title: true,
        createdAt: true,
      },
    });

    const assetGroups = new Map<string, typeof recentWorkOrders>();
    for (const wo of recentWorkOrders) {
      if (wo.assetId) {
        const key = `asset:${wo.assetId}`;
        const group = assetGroups.get(key) || [];
        group.push(wo);
        assetGroups.set(key, group);
      }
    }

    for (const [key, orders] of assetGroups.entries()) {
      if (orders.length >= threshold) {
        const assetId = key.replace('asset:', '');
        const relatedIds = orders.map((o) => o.id);
        const dominantCategory = orders[0].category;

        const existingAlert = await prisma.recurringFaultAlert.findFirst({
          where: {
            organizationId: org.id,
            assetId,
            status: { in: [RecurringFaultStatus.ACTIVE, RecurringFaultStatus.ACKNOWLEDGED] },
          },
        });

        const suggestedAction = `Asset has reported ${orders.length} incidents in the last ${windowDays} days (${dominantCategory}). Comprehensive diagnostic inspection or overhaul recommended.`;

        if (existingAlert) {
          await prisma.recurringFaultAlert.update({
            where: { id: existingAlert.id },
            data: {
              incidentCount: orders.length,
              relatedWorkOrderIds: relatedIds,
              suggestedAction,
            },
          });
          alertsUpdated++;
        } else {
          await prisma.recurringFaultAlert.create({
            data: {
              organizationId: org.id,
              assetId,
              category: dominantCategory,
              relatedWorkOrderIds: relatedIds,
              incidentCount: orders.length,
              detectionWindowDays: windowDays,
              suggestedAction,
              status: RecurringFaultStatus.ACTIVE,
            },
          });
          alertsCreated++;

          const managers = await prisma.user.findMany({
            where: {
              organizationId: org.id,
              role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
              isActive: true,
            },
            select: { id: true },
          });

          if (managers.length > 0) {
            await prisma.notification.createMany({
              data: managers.map((m) => ({
                organizationId: org.id,
                recipientId: m.id,
                type: NotificationType.RECURRING_FAULT_DETECTED,
                title: 'Recurring Fault Detected',
                body: `Asset experienced ${orders.length} incidents within ${windowDays} days. Preventive inspection advised.`,
              })),
            });
          }
        }
      }
    }
  }

  logger.info({ alertsCreated, alertsUpdated }, 'Recurring fault detection completed');
  return { alertsCreated, alertsUpdated };
}

export function createRecurringFaultWorker(): Worker<RecurringFaultJobPayload> {
  const worker = new Worker<RecurringFaultJobPayload>(
    QUEUE_NAMES.RECURRING_FAULT,
    async (job) => processRecurringFaultDetection(job),
    {
      connection: redisConnection,
      concurrency: 1,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Recurring fault worker job failed');
  });

  return worker;
}

