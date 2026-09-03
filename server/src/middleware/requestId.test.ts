import { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from './requestId';

// Mock uuid to avoid ESM import issues
jest.mock('uuid', () => ({
    v4: () => 'test-uuid-123',
}));

describe('RequestId Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {};
        mockRes = {
            setHeader: jest.fn(),
        };
        mockNext = jest.fn();
    });

    it('should add request ID to request', () => {
        requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockReq.id).toEqual('test-uuid-123');
        expect(mockNext).toHaveBeenCalled();
    });

    it('should set X-Request-ID header', () => {
        requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.setHeader).toHaveBeenCalledWith(
            'X-Request-ID',
            'test-uuid-123'
        );
    });
});
