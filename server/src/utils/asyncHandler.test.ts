import { asyncHandler } from './asyncHandler';
import { Request, Response, NextFunction } from 'express';

describe('asyncHandler', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {};
        mockRes = {};
        mockNext = jest.fn();
    });

    it('should call the async function and not call next on success', async () => {
        const asyncFn = jest.fn().mockResolvedValue('success');
        const handler = asyncHandler(asyncFn);

        await handler(mockReq as Request, mockRes as Response, mockNext);

        expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next with error if async function rejects', async () => {
        const error = new Error('Test error');
        const asyncFn = jest.fn().mockRejectedValue(error);
        const handler = asyncHandler(asyncFn);

        await handler(mockReq as Request, mockRes as Response, mockNext);

        expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
        expect(mockNext).toHaveBeenCalledWith(error);
    });
});
