import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth';
import logger from '../utils/logger';

export const createUserRateLimiter = (maxRequests: number, windowMs: number) => {
    return rateLimit({
        windowMs,
        max: maxRequests,
        keyGenerator: (req: AuthRequest) => {
            const authReq = req as AuthRequest;
            return authReq.user?.id || req.ip || 'unknown';
        },
        handler: (req, res, next, options) => {
            const authReq = req as AuthRequest;
            const userId = authReq.user?.id || 'anonymous';

            logger.warn(`Rate limit exceeded for user: ${userId}`, {
                userId,
                ip: req.ip,
                path: req.path,
                method: req.method,
                limit: maxRequests,
                windowMs
            });

            res.status(options.statusCode).send(options.message);
        },
        message: {
            status: 'error',
            message: 'Too many requests from this account, please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    });
};
