import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to add a unique request ID to each request
 * This helps with request tracing and debugging across the system
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    // Generate a unique ID for this request
    req.id = uuidv4();

    // Set the request ID in the response header for client tracking
    res.setHeader('X-Request-ID', req.id);

    next();
};
