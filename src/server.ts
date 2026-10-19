import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { disconnectDatabase } from './database/prisma';
import { disconnectRedis } from './database/redis';
import { createAITriageWorker } from './workers/ai-triage.worker';
import { createEmailWorker } from './workers/email.worker';

const server = http.createServer(app);

let aiWorker: ReturnType<typeof createAITriageWorker> | null = null;
let emailWorker: ReturnType<typeof createEmailWorker> | null = null;

server.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      apiPrefix: env.API_PREFIX,
    },
    `FixFlow API server running on port ${env.PORT}`
  );

  if (env.NODE_ENV !== 'test') {
    try {
      aiWorker = createAITriageWorker();
      emailWorker = createEmailWorker();
      logger.info('Embedded AI triage and email workers initialized in API process');
    } catch (workerErr) {
      logger.warn({ workerErr }, 'Could not initialize embedded BullMQ workers');
    }
  }
});

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  if (aiWorker) await aiWorker.close();
  if (emailWorker) await emailWorker.close();

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server');
      process.exit(1);
    }

    try {
      await disconnectDatabase();
    } catch (disconnectErr) {
      logger.error({ err: disconnectErr }, 'Error disconnecting database');
    }

    try {
      await disconnectRedis();
    } catch (redisErr) {
      logger.error({ err: redisErr }, 'Error disconnecting Redis');
    }

    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

export { server };
