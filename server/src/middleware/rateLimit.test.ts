import request from 'supertest';
import express from 'express';

jest.mock('../utils/redis', () => ({
    getRedisClient: jest.fn(() => null),
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
});
