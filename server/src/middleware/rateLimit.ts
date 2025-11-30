import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth';

export const createUserRateLimiter = (maxRequests: number, windowMs: number) => {
    return rateLimit({
        windowMs,
        max: maxRequests,
        keyGenerator: (req: AuthRequest) => {
            const authReq = req as AuthRequest;
            return authReq.user?.id || req.ip || 'unknown';
        },
        message: {
            status: 'error',
            message: 'Too many requests from this account, please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
    });
};
