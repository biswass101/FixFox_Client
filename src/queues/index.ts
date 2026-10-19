import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions } from './queue.config';
import {
  QUEUE_NAMES,
  AITriageJobPayload,
  EmailJobPayload,
  SlaMonitorJobPayload,
  RecurringFaultJobPayload,
} from './queue.types';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('Queues');

export const aiTriageQueue = new Queue<AITriageJobPayload>(QUEUE_NAMES.AI_TRIAGE, {
  connection: redisConnection,
  defaultJobOptions,
});

export const emailQueue = new Queue<EmailJobPayload>(QUEUE_NAMES.EMAIL, {
  connection: redisConnection,
  defaultJobOptions,
});

export const slaMonitorQueue = new Queue<SlaMonitorJobPayload>(QUEUE_NAMES.SLA_MONITOR, {
  connection: redisConnection,
  defaultJobOptions,
});

export const recurringFaultQueue = new Queue<RecurringFaultJobPayload>(
  QUEUE_NAMES.RECURRING_FAULT,
  {
    connection: redisConnection,
    defaultJobOptions,
  }
);

export async function dispatchAITriage(
  payload: AITriageJobPayload
): Promise<string | undefined> {
  let jobId: string | undefined;
  try {
    const job = await aiTriageQueue.add('analyze-work-order', payload, {
      jobId: `ai-triage:${payload.workOrderId}${payload.isRetry ? `:${Date.now()}` : ''}`,
    });
    logger.info({ workOrderId: payload.workOrderId, jobId: job.id }, 'Dispatched AI triage job to queue');
    jobId = job.id;
  } catch (error) {
    logger.warn({ error, payload }, 'Failed to queue AI triage job, initiating direct background triage');
  }

  // Ensure triage is executed immediately in the background even if external worker is offline
  setImmediate(async () => {
    try {
      const { aiTriageService } = await import('../modules/ai-triage/ai-triage.service');
      await aiTriageService.runTriage(payload.workOrderId, payload.organizationId);
    } catch (err) {
      logger.error({ err, workOrderId: payload.workOrderId }, 'Background AI triage execution failed');
    }
  });

  return jobId;
}

export async function dispatchEmail(payload: EmailJobPayload): Promise<string | undefined> {
  try {
    const job = await emailQueue.add('send-email', payload);
    logger.info({ to: payload.to, subject: payload.subject, jobId: job.id }, 'Dispatched email job');
    return job.id;
  } catch (error) {
    logger.error({ error, payload }, 'Failed to dispatch email job');
    return undefined;
  }
}

export async function dispatchSlaCheck(
  payload: SlaMonitorJobPayload = { timestamp: Date.now() }
): Promise<string | undefined> {
  try {
    const job = await slaMonitorQueue.add('check-sla-deadlines', payload);
    return job.id;
  } catch (error) {
    logger.error({ error }, 'Failed to dispatch SLA check job');
    return undefined;
  }
}

export async function dispatchRecurringFaultCheck(
  payload: RecurringFaultJobPayload = { timestamp: Date.now() }
): Promise<string | undefined> {
  try {
    const job = await recurringFaultQueue.add('check-recurring-faults', payload);
    return job.id;
  } catch (error) {
    logger.error({ error }, 'Failed to dispatch recurring fault check job');
    return undefined;
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    aiTriageQueue.close(),
    emailQueue.close(),
    slaMonitorQueue.close(),
    recurringFaultQueue.close(),
  ]);
  logger.info('BullMQ queues closed');
}

export * from './queue.types';
export * from './queue.config';

