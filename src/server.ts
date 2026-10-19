import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { disconnectDatabase } from './database/prisma';
import { disconnectRedis } from './database/redis';

const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      apiPrefix: env.API_PREFIX,
    },
    `FixFlow API server running on port ${env.PORT}`
  );
});

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received. Starting graceful shutdown...`);

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
