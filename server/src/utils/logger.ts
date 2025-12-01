import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Define log format with request ID support
const logFormat = printf(({ level, message, timestamp, requestId, stack, ...metadata }) => {
    const requestIdStr = requestId ? `[${requestId}] ` : '';
    let msg = `${timestamp} [${level}]: ${requestIdStr}${message}`;

    // Add stack trace if present (for errors)
    if (stack) {
        msg += `\n${stack}`;
    }

    // Add metadata if present (excluding requestId as it's already in the message)
    const filteredMeta = { ...metadata };
    delete filteredMeta.service;
    if (Object.keys(filteredMeta).length > 0) {
        msg += `\n${JSON.stringify(filteredMeta, null, 2)}`;
    }

    return msg;
});

// Create the logger
export const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
    ),
    transports: [
        // Write all logs to console
        new winston.transports.Console({
            format: combine(
                colorize(),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        }),
        // Write errors to error.log
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Write all logs to combined.log
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ],
    // Handle uncaught exceptions
    exceptionHandlers: [
        new winston.transports.File({ filename: 'logs/exceptions.log' })
    ],
    // Handle unhandled promise rejections
    rejectionHandlers: [
        new winston.transports.File({ filename: 'logs/rejections.log' })
    ]
});

// Create a stream object for Morgan HTTP logging
export const stream = {
    write: (message: string) => {
        logger.info(message.trim());
    }
};

/**
 * Create a child logger with request-specific context
 * @param requestId - Unique request identifier
 * @returns Winston logger instance with request context
 */
export const createRequestLogger = (requestId: string): winston.Logger => {
    return logger.child({ requestId });
};

export default logger;
