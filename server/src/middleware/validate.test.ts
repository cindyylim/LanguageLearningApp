import { Request, Response, NextFunction } from 'express';
import { validate } from './validate';
import { z } from 'zod';
import { AppError } from '../utils/AppError';

describe('Validate Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = { body: {} };
        mockRes = {};
        mockNext = jest.fn();
    });

    it('should pass validation with valid data', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number()
        });

        mockReq.body = { name: 'John', age: 30 };

        const middleware = validate(schema);
        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
    });

    it('should throw AppError with invalid data', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number()
        });

        mockReq.body = { name: 'John', age: 'invalid' };

        const middleware = validate(schema);

        expect(() => {
            middleware(mockReq as Request, mockRes as Response, mockNext);
        }).toThrow(AppError);
    });

    it('should include error messages in AppError', () => {
        const schema = z.object({
            email: z.string().email()
        });

        mockReq.body = { email: 'not-an-email' };

        const middleware = validate(schema);

        try {
            middleware(mockReq as Request, mockRes as Response, mockNext);
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).message).toContain('Validation error');
        }
    });
});
