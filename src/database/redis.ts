import Redis from 'ioredis';
import { env } from '../config/env';
import { createChildLogger } from '../config/logger';

const log = createChildLogger('Redis');

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    log.warn({ attempt: times, delay }, 'Retrying Redis connection');
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

redis.on('connect', () => {
  log.info('Redis client connected');
});

redis.on('ready', () => {
  log.info('Redis client ready');
});

redis.on('error', (err) => {
  log.error({ err }, 'Redis connection error');
});

redis.on('close', () => {
  log.warn('Redis connection closed');
});

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    log.info('Redis disconnected');
  } catch (err) {
    log.error({ err }, 'Error during Redis disconnect, forcing disconnect');
    redis.disconnect();
  }
}
