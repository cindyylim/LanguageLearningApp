import { Request, Response, NextFunction } from 'express';
import { createRequestLogger } from '../utils/logger';

/**
 * Middleware to log HTTP requests and responses
 * Attaches a request-scoped logger to req.logger
 */
export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    // Skip logging for health check endpoint to reduce noise
    if (req.path === '/health') {
        return next();
    }

    // Create a request-scoped logger with the request ID
    req.logger = createRequestLogger(req.id);

    // Log incoming request
    req.logger.info(`${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // Capture the start time
    const startTime = Date.now();

    // Hook into response finish event to log response
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const { statusCode } = res;
        const contentLength = res.get('content-length') || '0';

        // Determine log level based on status code
        const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

        req.logger[logLevel](`${req.method} ${req.path} ${statusCode} - ${duration}ms`, {
            method: req.method,
            path: req.path,
            statusCode,
            duration,
            contentLength
        });
    });

    next();
};
