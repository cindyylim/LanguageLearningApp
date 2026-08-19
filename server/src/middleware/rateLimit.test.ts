import request from 'supertest';
import express from 'express';

const mockGetRedisClient = jest.fn(() => null);

jest.mock('../utils/redis', () => ({
    getRedisClient: mockGetRedisClient,
}));

jest.mock('../utils/logger', () => ({
    __esModule: true,
    default: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

import { createUserRateLimiter } from './rateLimit';

function buildApp(maxRequests: number, windowMs: number, keyPrefix: string) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.user = { id: 'rate-limit-test-user' };
        next();
    });

    const limiter = createUserRateLimiter(maxRequests, windowMs, {
        requireUser: true,
        keyPrefix,
        message: {
            status: 'error',
            message: `Limit exceeded for ${keyPrefix}`,
        },
    });

    app.post('/limited', limiter, (_req, res) => {
        res.status(200).json({ ok: true });
    });

    return app;
}

describe('createUserRateLimiter', () => {
    it('allows requests under the per-minute limit', async () => {
        const app = buildApp(2, 60 * 1000, 'test-minute');

        await request(app).post('/limited').expect(200);
        await request(app).post('/limited').expect(200);
    });

    it('returns 429 when per-minute limit is exceeded', async () => {
        const app = buildApp(2, 60 * 1000, 'test-minute-429');

        await request(app).post('/limited').expect(200);
        await request(app).post('/limited').expect(200);

        const response = await request(app).post('/limited').expect(429);

        expect(response.body).toEqual({
            status: 'error',
            message: 'Limit exceeded for test-minute-429',
        });
    });

    it('returns 429 when per-day quota is exceeded', async () => {
        const app = buildApp(1, 24 * 60 * 60 * 1000, 'test-day-429');

        await request(app).post('/limited').expect(200);

        const response = await request(app).post('/limited').expect(429);

        expect(response.body).toEqual({
            status: 'error',
            message: 'Limit exceeded for test-day-429',
        });
    });

    it('uses IP fallback when user is not required and unauthenticated', async () => {
        const app = express();
        app.set('trust proxy', true);
        app.use(express.json());

        const limiter = createUserRateLimiter(1, 60 * 1000, {
            requireUser: false,
            keyPrefix: 'ip-fallback',
        });

        app.post('/limited', limiter, (_req, res) => {
            res.status(200).json({ ok: true });
        });

        await request(app).post('/limited').set('X-Forwarded-For', '1.2.3.4').expect(200);
        await request(app).post('/limited').set('X-Forwarded-For', '1.2.3.4').expect(429);
    });

    it('scopes unauthenticated users when requireUser is true', async () => {
        const app = express();
        app.use(express.json());

        const limiter = createUserRateLimiter(1, 60 * 1000, {
            requireUser: true,
            keyPrefix: 'anon',
        });

        app.post('/limited', limiter, (_req, res) => {
            res.status(200).json({ ok: true });
        });

        await request(app).post('/limited').expect(200);
        await request(app).post('/limited').expect(429);
    });
});

describe('createUserRateLimiter with Redis store', () => {
    const mockIncr = jest.fn();
    const mockPexpire = jest.fn();
    const mockPttl = jest.fn();
    const mockDecr = jest.fn();
    const mockDel = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockIncr.mockResolvedValue(1);
        mockPexpire.mockResolvedValue(1);
        mockPttl.mockResolvedValue(60_000);
        mockDecr.mockResolvedValue(0);
        mockDel.mockResolvedValue(1);

        mockGetRedisClient.mockReturnValue({
            incr: mockIncr,
            pexpire: mockPexpire,
            pttl: mockPttl,
            decr: mockDecr,
            del: mockDel,
        } as any);
    });

    afterEach(() => {
        mockGetRedisClient.mockReturnValue(null);
    });

    it('uses Redis increment and expiry for rate limiting', async () => {
        mockIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);

        const app = buildApp(2, 60 * 1000, 'redis-minute');

        await request(app).post('/limited').expect(200);
        await request(app).post('/limited').expect(200);
        await request(app).post('/limited').expect(429);

        expect(mockIncr).toHaveBeenCalled();
        expect(mockPexpire).toHaveBeenCalledWith(expect.stringContaining('rate-limit:'), 60_000);
    });
});
