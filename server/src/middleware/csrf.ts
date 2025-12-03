// CSRF Protection Middleware (custom implementation since csurf is deprecated)

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest } from './auth';

// Store for CSRF tokens (in production, use Redis or similar)
const csrfTokens = new Map<string, { token: string; expires: number }>();

// Clean up expired tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of csrfTokens.entries()) {
        if (value.expires < now) {
            csrfTokens.delete(key);
        }
    }
}, 60000); // Clean up every minute

/**
 * Generate a CSRF token
 */
export function generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to generate and set CSRF token in cookie
 */
export const setCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
    // Check if token already exists in cookie
    let token = req.cookies?.['XSRF-TOKEN'];

    if (!token) {
        // Generate new token
        token = generateCSRFToken();

        // Set cookie with token (accessible to JavaScript for reading)
        res.cookie('XSRF-TOKEN', token, {
            httpOnly: false, // Must be false so client can read it
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' required for cross-origin
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
    }

    // Store token with expiration
    const userId = (req as AuthRequest).user?.id || req.ip || 'anonymous';
    csrfTokens.set(userId, {
        token,
        expires: Date.now() + 24 * 60 * 60 * 1000
    });

    next();
};

/**
 * Middleware to verify CSRF token on state-changing requests
 */
export const verifyCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
    // Skip CSRF check for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    // Get token from cookie
    const cookieToken = req.cookies?.['XSRF-TOKEN'];

    if (!cookieToken) {
        res.status(403).json({ error: 'CSRF token missing' });
        return;
    }

    // Verify token exists in our store
    const userId = (req as AuthRequest).user?.id || req.ip || 'anonymous';
    const storedToken = csrfTokens.get(userId);

    if (!storedToken || storedToken.token !== cookieToken) {
        res.status(403).json({ error: 'CSRF token expired or invalid' });
        return;
    }

    next();
};

/**
 * Endpoint to get CSRF token
 */
export const getCSRFToken = (req: Request, res: Response): void => {
    const token = req.cookies?.['XSRF-TOKEN'];
    res.json({ csrfToken: token });
};
