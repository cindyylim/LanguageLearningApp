import { Request, Response, NextFunction } from 'express';

const mockSanitizeObject = jest.fn((obj: unknown) => obj);

jest.mock('../utils/sanitize', () => ({
    ...jest.requireActual('../utils/sanitize'),
    sanitizeObject: mockSanitizeObject,
}));

import { sanitizeInput } from './sanitize';

describe('Sanitize Input Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockSanitizeObject.mockClear();
        mockReq = {
            body: {},
            query: {},
            params: {},
        };
        mockRes = {};
        mockNext = jest.fn();
    });

    it('should sanitize request body', () => {
        mockReq.body = { name: "<script>alert('XSS Attack');</script>", age: 30 };

        sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

        expect(mockSanitizeObject).toHaveBeenCalledWith({ name: "<script>alert('XSS Attack');</script>", age: 30 });
        expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize query parameters', () => {
        mockReq.query = { search: ' OR "1"="1"' };

        sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

        expect(mockSanitizeObject).toHaveBeenCalledWith({ search: ' OR "1"="1"' });
        expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize route parameters', () => {
        mockReq.params = { id: '  123  ' };

        sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

        expect(mockSanitizeObject).toHaveBeenCalledWith({ id: '  123  ' });
        expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing request properties', () => {
        mockReq = {};

        sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

        expect(mockSanitizeObject).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalled();
    });
});
