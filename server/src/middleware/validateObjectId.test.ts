import { Request, Response, NextFunction } from 'express';
import { validateObjectId, isValidObjectId } from './validateObjectId';
import { AppError } from '../utils/AppError';

describe('ValidateObjectId Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = { params: {} };
        mockRes = {};
        mockNext = jest.fn();
    });

    describe('isValidObjectId', () => {
        it('should return true for valid ObjectId', () => {
            expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
        });

        it('should return false for invalid ObjectId', () => {
            expect(isValidObjectId('invalid')).toBe(false);
            expect(isValidObjectId('123')).toBe(false);
            expect(isValidObjectId(undefined)).toBe(false);
        });
    });

    describe('validateObjectId middleware', () => {
        it('should call next for valid ObjectId', () => {
            mockReq.params = { id: '507f1f77bcf86cd799439011' };

            const middleware = validateObjectId();
            middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should throw AppError for invalid ObjectId', () => {
            mockReq.params = { id: 'invalid' };

            const middleware = validateObjectId();

            expect(() => {
                middleware(mockReq as Request, mockRes as Response, mockNext);
            }).toThrow(AppError);
        });

        it('should validate custom param name', () => {
            mockReq.params = { listId: 'invalid' };

            const middleware = validateObjectId('listId');

            expect(() => {
                middleware(mockReq as Request, mockRes as Response, mockNext);
            }).toThrow('Invalid listId format');
        });
    });
});
