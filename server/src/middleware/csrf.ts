// CSRF Protection Middleware (Redis-backed store, double-submit via header only)

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest } from './auth';
import { getRedisClient } from '../utils/redis';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../utils/logger';

const CSRF_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const KEY_PREFIX = 'csrf:';

function getIdentity(req: Request): string | null {
    const user = (req as AuthRequest).user;
    return user?.id ?? null;
}

function keyFor(identity: string): string {
    return `${KEY_PREFIX}${identity}`;
}

export function generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Endpoint: issues a token for this identity and returns it in the JSON body.
 * Reuses an existing, unexpired token if one is already stored (so repeated
 * page loads within the TTL window don't invalidate an in-flight token).
 */
export const getCSRFToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const redis = getRedisClient();
    if (!redis) {
        logger.error('CSRF token issuance failed: Redis client unavailable');
        res.status(503).json({ error: 'CSRF token service temporarily unavailable' });
        return;
    }

    const identity = getIdentity(req);
    if (!identity) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const key = keyFor(identity);

    let token = await redis.get(key);
    if (!token) {
        token = generateCSRFToken();
        await redis.set(key, token, 'EX', CSRF_TTL_SECONDS);
    }

    res.set('Cache-Control', 'no-store');
    res.set('ETag', 'false');
    res.json({ csrfToken: token });
});

/**
 * Middleware to verify the X-CSRF-Token header against the Redis-backed store.
 */
export const verifyCSRFToken = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip CSRF check for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const headerToken = req.headers['x-csrf-token'];

    if (!headerToken || typeof headerToken !== 'string') {
        res.status(403).json({ error: 'CSRF token missing' });
        return;
    }

    const redis = getRedisClient();
    if (!redis) {
        logger.error('CSRF verification failed: Redis client unavailable');
        res.status(503).json({ error: 'CSRF verification temporarily unavailable' });
        return;
    }

    const identity = getIdentity(req);
    if (!identity) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const key = keyFor(identity);

    let storedToken: string | null;
    try {
        storedToken = await redis.get(key);
    } catch (error) {
        // If Redis itself is unreachable, fail closed (reject) rather than silently
        // letting unverified writes through — but log loudly, since this is a
        // production-availability problem, not a client error.
        logger.error('CSRF verification failed: Redis unreachable', { error });
        res.status(503).json({ error: 'CSRF verification temporarily unavailable' });
        return;
    }

    if (!storedToken || storedToken !== headerToken) {
        res.status(403).json({ error: 'CSRF token expired or invalid' });
        return;
    }

    next();
});