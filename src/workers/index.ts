import '../config/env';
import { createChildLogger } from '../config/logger';
import { createAITriageWorker } from './ai-triage.worker';
import { createEmailWorker } from './email.worker';
import { createSlaMonitorWorker } from './sla-monitor.worker';
import { createRecurringFaultWorker } from './recurring-fault.worker';
import { slaMonitorQueue, recurringFaultQueue, closeQueues } from '../queues';
import { disconnectDatabase } from '../database/prisma';
import { disconnectRedis } from '../database/redis';

const logger = createChildLogger('WorkerService');

async function startWorkers() {
  logger.info('Initializing FixFlow background workers...');

  const aiTriageWorker = createAITriageWorker();
  const emailWorker = createEmailWorker();
  const slaMonitorWorker = createSlaMonitorWorker();
  const recurringFaultWorker = createRecurringFaultWorker();

  await slaMonitorQueue.upsertJobScheduler(
    'sla-monitor-scheduler',
    { every: 5 * 60 * 1000 },
    {
      name: 'periodic-sla-check',
      data: { timestamp: Date.now() },
    }
  );

  await recurringFaultQueue.upsertJobScheduler(
    'recurring-fault-scheduler',
    { every: 60 * 60 * 1000 },
    {
      name: 'periodic-recurring-fault-check',
      data: { timestamp: Date.now() },
    }
  );

  logger.info('FixFlow background workers and schedulers are active and ready.');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down workers gracefully...');

    await Promise.allSettled([
      aiTriageWorker.close(),
      emailWorker.close(),
      slaMonitorWorker.close(),
      recurringFaultWorker.close(),
      closeQueues(),
    ]);

    await disconnectDatabase();
    await disconnectRedis();

    logger.info('Worker shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env.NODE_ENV !== 'test') {
  startWorkers().catch((error) => {
    logger.error({ error }, 'Fatal error during worker initialization');
    process.exit(1);
  });
}
