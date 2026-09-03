import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

const mockGetRedisClient = jest.fn(() => null);

jest.mock('../utils/redis', () => ({
    getRedisClient: mockGetRedisClient,
}));

jest.mock('../utils/logger', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    },
}));

import { getCSRFToken, verifyCSRFToken, generateCSRFToken } from './csrf';

async function runMiddleware(
    middleware: (req: Request, res: Response, next: NextFunction) => unknown,
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    middleware(req, res, next);
    await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('verifyCSRFToken', () => {
    const userId = 'test-user-id';
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let mockGet: jest.Mock;
    let mockSet: jest.Mock;

    beforeEach(() => {
        mockGet = jest.fn();
        mockSet = jest.fn();
        mockGetRedisClient.mockReturnValue({
            get: mockGet,
            set: mockSet,
        } as any);

        mockReq = {
            method: 'POST',
            headers: {},
            user: { id: userId, email: 'test@example.com', name: 'Test User' },
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
    });

    afterEach(() => {
        mockGetRedisClient.mockReturnValue(null);
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])('skips verification for %s requests', async (method) => {
        mockReq.method = method;

        await runMiddleware(verifyCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns 403 when CSRF header is missing', async () => {
        await runMiddleware(verifyCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF token missing' });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 503 when Redis is unavailable', async () => {
        mockGetRedisClient.mockReturnValue(null);
        mockReq.headers = { 'x-csrf-token': 'token-value' };

        await runMiddleware(verifyCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF verification temporarily unavailable' });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 503 when Redis get throws', async () => {
        mockReq.headers = { 'x-csrf-token': 'token-value' };
        mockGet.mockRejectedValue(new Error('Redis connection failed'));

        await runMiddleware(verifyCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF verification temporarily unavailable' });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 403 when stored token is missing or mismatched', async () => {
        mockReq.headers = { 'x-csrf-token': 'submitted-token' };
        mockGet.mockResolvedValue('different-token');

        await runMiddleware(verifyCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockGet).toHaveBeenCalledWith(`csrf:${userId}`);
        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF token expired or invalid' });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next when header matches stored token', async () => {
        mockReq.headers = { 'x-csrf-token': 'valid-token' };
        mockGet.mockResolvedValue('valid-token');

        await runMiddleware(verifyCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockGet).toHaveBeenCalledWith(`csrf:${userId}`);
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('forwards errors when user id is missing', async () => {
        mockReq.user = undefined;
        mockReq.headers = { 'x-csrf-token': 'valid-token' };

        await runMiddleware(verifyCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
            message: 'No user ID found in request',
        }));
        expect(mockGet).not.toHaveBeenCalled();
    });
});

describe('getCSRFToken', () => {
    const userId = 'test-user-id';
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let mockGet: jest.Mock;
    let mockSet: jest.Mock;

    beforeEach(() => {
        mockGet = jest.fn();
        mockSet = jest.fn().mockResolvedValue('OK');
        mockGetRedisClient.mockReturnValue({
            get: mockGet,
            set: mockSet,
        } as any);

        mockReq = {
            user: { id: userId, email: 'test@example.com', name: 'Test User' },
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
    });

    afterEach(() => {
        mockGetRedisClient.mockReturnValue(null);
    });

    it('returns 503 when Redis is unavailable', async () => {
        mockGetRedisClient.mockReturnValue(null);

        await runMiddleware(getCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF token service temporarily unavailable' });
    });

    it('reuses an existing token from Redis', async () => {
        mockGet.mockResolvedValue('existing-token');

        await runMiddleware(getCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockGet).toHaveBeenCalledWith(`csrf:${userId}`);
        expect(mockSet).not.toHaveBeenCalled();
        expect(mockRes.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(mockRes.set).toHaveBeenCalledWith('ETag', 'false');
        expect(mockRes.json).toHaveBeenCalledWith({ csrfToken: 'existing-token' });
    });

    it('issues and stores a new token when none exists', async () => {
        mockGet.mockResolvedValue(null);

        await runMiddleware(getCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockSet).toHaveBeenCalledWith(
            `csrf:${userId}`,
            expect.stringMatching(/^[a-f0-9]{64}$/),
            'EX',
            24 * 60 * 60
        );
        expect(mockRes.json).toHaveBeenCalledWith({
            csrfToken: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
    });

    it('forwards errors when user id is missing', async () => {
        mockReq.user = undefined;

        await runMiddleware(getCSRFToken, mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
            message: 'No user ID found in request',
        }));
        expect(mockGet).not.toHaveBeenCalled();
    });
});

describe('generateCSRFToken', () => {
    it('returns a 64-character hex string', () => {
        expect(generateCSRFToken()).toMatch(/^[a-f0-9]{64}$/);
    });
});
