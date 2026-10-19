import { Worker, Job } from 'bullmq';
import { WorkOrderStatus, NotificationType, UserRole } from '@prisma/client';
import { prisma } from '../database/prisma';
import { redisConnection } from '../queues/queue.config';
import { QUEUE_NAMES, SlaMonitorJobPayload } from '../queues/queue.types';
import { emailService } from '../modules/email/email.service';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('SlaMonitorWorker');

export async function processSlaMonitoring(_job?: Job<SlaMonitorJobPayload>): Promise<{
  overdueCount: number;
  approachingCount: number;
}> {
  const now = new Date();
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

  const organizationFilter = _job?.data?.organizationId
    ? { organizationId: _job.data.organizationId }
    : {};

  const activeWorkOrders = await prisma.workOrder.findMany({
    where: {
      ...organizationFilter,
      status: {
        in: [
          WorkOrderStatus.OPEN,
          WorkOrderStatus.ASSIGNED,
          WorkOrderStatus.IN_PROGRESS,
        ],
      },
      dueAt: { not: null },
    },
    include: {
      assignee: true,
      reporter: true,
    },
  });

  let overdueCount = 0;
  let approachingCount = 0;

  for (const wo of activeWorkOrders) {
    const dueAt = wo.dueAt;
    if (!dueAt) continue;

    if (dueAt < now) {
      const alreadyNotified = await prisma.notification.findFirst({
        where: {
          workOrderId: wo.id,
          type: NotificationType.WORK_ORDER_OVERDUE,
        },
      });

      if (!alreadyNotified) {
        overdueCount++;

        const managers = await prisma.user.findMany({
          where: {
            organizationId: wo.organizationId,
            role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
            isActive: true,
          },
          select: { id: true, email: true, fullName: true },
        });

        const recipients = [...managers];
        if (wo.assignee && !recipients.some((r) => r.id === wo.assignee!.id)) {
          recipients.push({
            id: wo.assignee.id,
            email: wo.assignee.email,
            fullName: wo.assignee.fullName,
          });
        }

        if (recipients.length > 0) {
          try {
            await prisma.notification.createMany({
              data: recipients.map((r) => ({
                organizationId: wo.organizationId,
                recipientId: r.id,
                workOrderId: wo.id,
                type: NotificationType.WORK_ORDER_OVERDUE,
                title: 'Work Order Overdue',
                body: `Work order "${wo.title}" is overdue (due at ${dueAt.toISOString()}).`,
              })),
            });
          } catch {
          }

          for (const recipient of recipients) {
            await emailService.notifySlaBreached({
              to: recipient.email,
              recipientName: recipient.fullName,
              workOrderId: wo.id,
              title: wo.title,
              priority: wo.priority,
              dueAt,
            }).catch((err) => {
              logger.error({ err, recipient: recipient.email }, 'Failed sending SLA overdue email');
            });
          }
        }
      }
    } else if (dueAt <= thirtyMinutesFromNow) {
      const alreadyNotified = await prisma.notification.findFirst({
        where: {
          workOrderId: wo.id,
          type: NotificationType.DEADLINE_APPROACHING,
        },
      });

      if (!alreadyNotified && wo.assignee) {
        approachingCount++;
        await prisma.notification.create({
          data: {
            organizationId: wo.organizationId,
            recipientId: wo.assignee.id,
            workOrderId: wo.id,
            type: NotificationType.DEADLINE_APPROACHING,
            title: 'Deadline Approaching',
            body: `Work order "${wo.title}" is due in less than 30 minutes.`,
          },
        });
      }
    }
  }

  logger.info({ overdueCount, approachingCount }, 'SLA monitoring cycle finished');
  return { overdueCount, approachingCount };
}

export function createSlaMonitorWorker(): Worker<SlaMonitorJobPayload> {
  const worker = new Worker<SlaMonitorJobPayload>(
    QUEUE_NAMES.SLA_MONITOR,
    async (job) => processSlaMonitoring(job),
    {
      connection: redisConnection,
      concurrency: 1,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'SLA monitor job failed');
  });

  return worker;
}
