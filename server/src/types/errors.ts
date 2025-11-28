// Error type definitions and type guards for server

export interface MongoError extends Error {
    name: 'CastError' | 'ValidationError';
    path?: string;
    value?: unknown;
    code?: number;
}

export interface JWTError extends Error {
    name: 'JsonWebTokenError' | 'TokenExpiredError';
}

export function isMongoError(error: unknown): error is MongoError {
    return (
        error instanceof Error &&
        (error.name === 'CastError' || error.name === 'ValidationError')
    );
}

export function isJWTError(error: unknown): error is JWTError {
    return (
        error instanceof Error &&
        (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError')
    );
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'An unknown error occurred';
}
