import { Worker } from 'bullmq';
import { redisConnection } from '../queues/queue.config';
import { QUEUE_NAMES, AITriageJobPayload } from '../queues/queue.types';
import { aiTriageService } from '../modules/ai-triage/ai-triage.service';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('AITriageWorker');

export function createAITriageWorker(): Worker<AITriageJobPayload> {
  const worker = new Worker<AITriageJobPayload>(
    QUEUE_NAMES.AI_TRIAGE,
    async (job) => {
      logger.info(
        { jobId: job.id, workOrderId: job.data.workOrderId },
        'Processing AI triage job'
      );
      return aiTriageService.runTriage(
        job.data.workOrderId,
        job.data.organizationId
      );
    },
    {
      connection: redisConnection,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'AI triage job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'AI triage job failed');
  });

  return worker;
}

