import rateLimit, { type Options, type Store, type IncrementResponse } from 'express-rate-limit';
import type Redis from 'ioredis';
import { AuthRequest } from './auth';
import logger from '../utils/logger';
import { getRedisClient } from '../utils/redis';

/**
 * Per-user rate limiter options.
 *
 * Storage: uses Redis when REDIS_URL is set (shared across server processes).
 * Otherwise falls back to in-memory storage (per-process only — limits reset on
 * restart and are not shared across multiple instances).
 */
export interface UserRateLimiterOptions {
    message?: Options['message'];
    keyPrefix?: string;
    /** When true, keys are scoped to authenticated user id only (no IP fallback). */
    requireUser?: boolean;
}

class RedisRateLimitStore implements Store {
    private redis: Redis;
    private windowMs = 0;
    private readonly redisKeyPrefix = 'rate-limit:';

    constructor(redis: Redis) {
        this.redis = redis;
    }

    init(options: Options): void {
        this.windowMs = options.windowMs;
    }

    async increment(key: string): Promise<IncrementResponse> {
        const redisKey = `${this.redisKeyPrefix}${key}`;
        const count = await this.redis.incr(redisKey);

        if (count === 1) {
            await this.redis.pexpire(redisKey, this.windowMs);
        }

        const ttlMs = await this.redis.pttl(redisKey);
        const resetTime = ttlMs > 0 ? new Date(Date.now() + ttlMs) : undefined;

        return { totalHits: count, resetTime };
    }

    async decrement(key: string): Promise<void> {
        const redisKey = `${this.redisKeyPrefix}${key}`;
        const count = await this.redis.decr(redisKey);
        if (count <= 0) {
            await this.redis.del(redisKey);
        }
    }

    async resetKey(key: string): Promise<void> {
        await this.redis.del(`${this.redisKeyPrefix}${key}`);
    }
}

function resolveStore(): Store | undefined {
    const redis = getRedisClient();
    if (!redis) {
        return undefined;
    }

    return new RedisRateLimitStore(redis);
}

export const createUserRateLimiter = (
    maxRequests: number,
    windowMs: number,
    options: UserRateLimiterOptions = {}
) => {
    const {
        message = {
            status: 'error',
            message: 'Too many requests from this account, please try again later.',
        },
        keyPrefix = 'rl',
        requireUser = false,
    } = options;

    const store = resolveStore();

    return rateLimit({
        windowMs,
        max: maxRequests,
        store,
        keyGenerator: (req: AuthRequest) => {
            const authReq = req as AuthRequest;
            const userId = authReq.user?.id;

            if (requireUser && !userId) {
                return `${keyPrefix}:unauthenticated`;
            }

            const identity = userId || req.ip || 'unknown';
            return `${keyPrefix}:${identity}`;
        },
        handler: (req, res, next, rateLimitOptions) => {
            const authReq = req as AuthRequest;
            const userId = authReq.user?.id || 'anonymous';

            logger.warn(`Rate limit exceeded for user: ${userId}`, {
                userId,
                ip: req.ip,
                path: req.path,
                method: req.method,
                limit: maxRequests,
                windowMs,
                keyPrefix,
            });

            res.status(rateLimitOptions.statusCode).send(rateLimitOptions.message);
        },
        message,
        standardHeaders: true,
        legacyHeaders: false,
    });
};
