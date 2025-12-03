import { Request, Response, NextFunction } from 'express';
import { errorHandler } from './error';
import { AppError } from '../utils/AppError';
import { ZodError } from 'zod';

jest.mock('../utils/logger', () => ({
    error: jest.fn(),
    info: jest.fn(),
}));

describe('Error Handler Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = { id: 'test-request-id' };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
        process.env.NODE_ENV = 'production';
    });

    it('should handle AppError correctly', () => {
        const error = new AppError('Test error', 404);

        errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Test error',
                status: 'fail',
            })
        );
    });

    it('should handle generic errors in production', () => {
        const error = new Error('Generic error');

        errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Something went very wrong!',
            })
        );
    });

    it('should expose stack trace in development', () => {
        process.env.NODE_ENV = 'development';
        const error = new Error('Dev error');

        errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                stack: expect.any(String),
            })
        );
    });

    it('should handle ZodError', () => {
        const zodError = new ZodError([
            {
                code: 'invalid_type',
                expected: 'string',
                received: 'number',
                path: ['name'],
                message: 'Expected string, received number',
            },
        ]);

        errorHandler(zodError, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
    });
});
