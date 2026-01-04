import { Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from './auth';
import jwt from 'jsonwebtoken';
import { connectToTestDatabase } from '../utils/testMongo';
import { ObjectId } from 'mongodb';

jest.mock('jsonwebtoken');
jest.mock('../utils/testMongo');
jest.mock('../utils/logger', () => ({
    error: jest.fn(),
    info: jest.fn(),
}));

describe('Auth Middleware', () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let mockDb: any;

    beforeEach(() => {
        mockReq = {
            cookies: {},
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();

        mockDb = {
            collection: jest.fn().mockReturnValue({
                findOne: jest.fn(),
            }),
        };
        (connectToTestDatabase as jest.Mock).mockResolvedValue(mockDb);

        process.env.JWT_SECRET = 'test-secret';
    });

    it('should return 401 if no token provided', async () => {
        mockReq.cookies = {};

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied. No token provided.' });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should authenticate valid token and set req.user', async () => {
        const userId = new ObjectId();
        const token = 'valid-token';
        const decoded = { userId: userId.toString(), iat: Date.now(), exp: Date.now() + 3600 };

        mockReq.cookies = { token };
        (jwt.verify as jest.Mock).mockReturnValue(decoded);

        const mockUser = {
            _id: userId,
            email: 'test@example.com',
            name: 'Test User',
        };
        mockDb.collection().findOne.mockResolvedValue(mockUser);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(jwt.verify).toHaveBeenCalledWith(token, 'test-secret');
        expect(mockReq.user).toEqual({
            id: userId.toString(),
            email: 'test@example.com',
            name: 'Test User',
        });
        expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 if user not found', async () => {
        const token = 'valid-token';
        const decoded = { userId: new ObjectId().toString(), iat: Date.now(), exp: Date.now() + 3600 };

        mockReq.cookies = { token };
        (jwt.verify as jest.Mock).mockReturnValue(decoded);
        mockDb.collection().findOne.mockResolvedValue(null);

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token. User not found.' });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if token is invalid', async () => {
        const token = 'invalid-token';

        mockReq.cookies = { token };
        (jwt.verify as jest.Mock).mockImplementation(() => {
            throw new Error('Invalid token');
        });

        await authMiddleware(mockReq as AuthRequest, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token.' });
    });
});
