// Input sanitization middleware

import { Request, Response, NextFunction } from 'express';
import { sanitizeObject } from '../utils/sanitize';

/**
 * Middleware to sanitize all incoming request data
 * Sanitizes body, query params, and route params
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query as Record<string, unknown>) as typeof req.query;
    }

    // Sanitize route parameters
    if (req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params);
    }

    next();
};
