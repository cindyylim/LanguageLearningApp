import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ZodError } from 'zod';
import { MongoError, isMongoError, isJWTError } from '../types/errors';

const handleZodError = (err: ZodError) => {
    const message = `Invalid input data. ${err.errors.map(e => e.message).join('. ')}`;
    return new AppError(message, 400);
};

const handleCastError = (err: MongoError) => {
    const message = `Invalid ${err.path}: ${err.value}.`;
    return new AppError(message, 400);
};

const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401);

export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
    // Default error properties
    let statusCode = 500;
    let status = 'error';
    let message = 'Something went wrong';
    let stack: string | undefined;

    // Extract error properties if it's an Error instance
    if (err instanceof Error) {
        message = err.message;
        stack = err.stack;

        // Check if it's an AppError with custom status code
        if ('statusCode' in err && typeof err.statusCode === 'number') {
            statusCode = err.statusCode;
        }
        if ('status' in err && typeof err.status === 'string') {
            status = err.status;
        }
    }

    if (process.env.NODE_ENV === 'development') {
        res.status(statusCode).json({
            status,
            error: err,
            message,
            stack
        });
    } else {
        let error: AppError | Error = err instanceof Error ? err : new Error(String(err));

        if (err instanceof ZodError) error = handleZodError(err);
        if (isMongoError(err)) error = handleCastError(err);
        if (isJWTError(err)) {
            error = err.name === 'TokenExpiredError' ? handleJWTExpiredError() : handleJWTError();
        }

        const isOperational = error instanceof AppError && error.isOperational;

        if (isOperational) {
            res.status((error as AppError).statusCode).json({
                status: (error as AppError).status,
                message: error.message
            });
        } else {
            console.error('ERROR 💥', err);
            res.status(500).json({
                status: 'error',
                message: 'Something went very wrong!'
            });
        }
    }
};
