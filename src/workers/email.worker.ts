import { Worker } from 'bullmq';
import { redisConnection } from '../queues/queue.config';
import { QUEUE_NAMES, EmailJobPayload } from '../queues/queue.types';
import { emailService } from '../modules/email/email.service';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('EmailWorker');

export function createEmailWorker(): Worker<EmailJobPayload> {
  const worker = new Worker<EmailJobPayload>(
    QUEUE_NAMES.EMAIL,
    async (job) => {
      logger.info(
        { jobId: job.id, to: job.data.to, subject: job.data.subject },
        'Processing email job'
      );
      return emailService.sendMail(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Email job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Email job failed');
  });

  return worker;
}

