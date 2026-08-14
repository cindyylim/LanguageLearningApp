import { AIService } from '../services/ai';
import { connectToDatabase } from './mongo';
import { connectToTestDatabase } from './testMongo';
import { redisHealthCheck } from './redis';
import { getHealthStatus } from './health';

jest.mock('../services/ai', () => ({
    AIService: {
        healthCheck: jest.fn().mockRejectedValue(new Error('OpenAI unavailable')),
    },
}));

jest.mock('./mongo', () => ({
    connectToDatabase: jest.fn(),
}));

jest.mock('./testMongo', () => ({
    connectToTestDatabase: jest.fn(),
}));

jest.mock('./redis', () => ({
    redisHealthCheck: jest.fn(),
}));

jest.mock('./logger', () => ({
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

describe('getHealthStatus', () => {
    const mockPing = jest.fn();
    const mockDb = {
        admin: () => ({ ping: mockPing }),
    };

    beforeEach(() => {
        mockPing.mockResolvedValue({ ok: 1 });
        (connectToTestDatabase as jest.Mock).mockResolvedValue(mockDb);
        (connectToDatabase as jest.Mock).mockResolvedValue(mockDb);
        (redisHealthCheck as jest.Mock).mockResolvedValue(true);
    });

    it('returns OK when database and redis are healthy and does not call the AI model', async () => {
        const health = await getHealthStatus();

        expect(health.status).toBe('OK');
        expect(health.checks.database).toBe('healthy');
        expect(health.checks.redis).toBe('healthy');
        expect(health.checks.ai).toBe('optional');
        expect(AIService.healthCheck).not.toHaveBeenCalled();
    });

    it('returns DEGRADED when the database ping fails without calling AI', async () => {
        mockPing.mockRejectedValue(new Error('db down'));

        const health = await getHealthStatus();

        expect(health.status).toBe('DEGRADED');
        expect(health.checks.database).toBe('unhealthy');
        expect(health.checks.ai).toBe('optional');
        expect(AIService.healthCheck).not.toHaveBeenCalled();
    });

    it('returns DEGRADED when redis is unhealthy without calling AI', async () => {
        (redisHealthCheck as jest.Mock).mockResolvedValue(false);

        const health = await getHealthStatus();

        expect(health.status).toBe('DEGRADED');
        expect(health.checks.redis).toBe('unhealthy');
        expect(health.checks.ai).toBe('optional');
        expect(AIService.healthCheck).not.toHaveBeenCalled();
    });
});
