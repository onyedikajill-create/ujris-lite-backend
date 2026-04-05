import Redis from 'ioredis';
import { logger } from './logger';

let redisClient: Redis | null = null;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 5) {
          logger.error('Redis max retries reached - disabling Redis');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err) => logger.warn({ err }, 'Redis error'));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  } catch (err) {
    logger.warn({ err }, 'Redis initialization failed - running without Redis');
    redisClient = null;
  }
} else {
  logger.info('REDIS_URL not set - running without Redis (in-memory rate limiting)');
}

export const redis = redisClient;

export async function getRedisValue(key: string): Promise<string | null> {
  if (!redisClient) return null;
  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
}

export async function setRedisValue(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  if (!redisClient) return;
  try {
    if (ttlSeconds) {
      await redisClient.setex(key, ttlSeconds, value);
    } else {
      await redisClient.set(key, value);
    }
  } catch {
    // Redis failure is non-fatal
  }
}

export async function deleteRedisKey(key: string): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    // Redis failure is non-fatal
  }
}
