import Redis from 'ioredis';
import logger from './logger';

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
        return null;
    }

    if (client) {
        return client;
    }

    try {
        client = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                return Math.min(times * 200, 5000);
            },
            lazyConnect: false,
        });

        client.on('connect', () => {
            logger.info('🔌 Redis connected');
        });

        client.on('error', (err) => {
            logger.error('Redis error:', err);
        });

        return client;
    } catch (err) {
        logger.error('Failed to initialize Redis client:', err);
        return null;
    }
}

export async function redisHealthCheck(): Promise<boolean> {
    try {
        const redis = getRedisClient();
        if (!redis) return false;
        const pong = await redis.ping();
        return pong === 'PONG';
    } catch {
        return false;
    }
}