import { Router, Request, Response } from 'express';
import { prisma } from '../../database/prisma';
import { asyncHandler } from '../../common/utils/async-handler';
import { createChildLogger } from '../../config/logger';

const log = createChildLogger('HealthRoutes');
const router = Router();

router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.get(
  '/health/ready',
  asyncHandler(async (_req: Request, res: Response) => {
    const dependencies: Record<string, 'ok' | 'unavailable'> = {
      database: 'unavailable',
      redis: 'unavailable',
    };

    const withTimeout = <T>(promise: Promise<T>, ms = 1500): Promise<T> => {
      let timer: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Health check timeout')), ms);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
    };

    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`);
      dependencies.database = 'ok';
    } catch (err) {
      log.warn({ err }, 'Database health check failed');
    }

    try {
      const { redis } = await import('../../database/redis');
      if (redis && typeof redis.ping === 'function') {
        const pong = await withTimeout(redis.ping());
        if (pong === 'PONG') {
          dependencies.redis = 'ok';
        }
      }
    } catch {
      log.warn('Redis health check failed or Redis module not available');
    }

    const allHealthy = Object.values(dependencies).every((v) => v === 'ok');

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies,
    });
  })
);

export { router as healthRoutes };
