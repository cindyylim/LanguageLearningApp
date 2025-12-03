import { Request, Response, NextFunction } from 'express';
import { sanitizeInput } from './sanitize';
import * as sanitizeUtils from '../utils/sanitize';

jest.spyOn(sanitizeUtils, 'sanitizeObject').mockImplementation((obj) => {
    // Properly sanitize and return the object  
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = typeof value === 'string' ? value.trim() : value;
    }
    return sanitized;
});

describe('Sanitize Input Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {
            body: {},
            query: {},
            params: {},
        };
        mockRes = {};
        mockNext = jest.fn();
    });

    it('should sanitize request body', () => {
        mockReq.body = { name: '  John  ', age: 30 };

        sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

        expect(mockReq.body.name).toBe('John');
        expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize query parameters', () => {
        mockReq.query = { search: '  test  ' };

        sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

        expect(mockReq.query.search).toBe('test');
        expect(mockNext).toHaveBeenCalled();
    });

    it('should sanitize route parameters', () => {
        mockReq.params = { id: '  123  ' };

        sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

        expect(mockReq.params.id).toBe('123');
        expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing request properties', () => {
        mockReq = {};

        sanitizeInput(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
    });
});
