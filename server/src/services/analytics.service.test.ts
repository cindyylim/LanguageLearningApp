import { AnalyticsService } from './analytics.service';
import { connectToDatabase } from '../utils/mongo';

jest.mock('../utils/mongo');
jest.mock('./ai');

describe('AnalyticsService', () => {
    let mockDb: any;

    beforeEach(() => {
        mockDb = {
            collection: jest.fn().mockReturnValue({
                find: jest.fn().mockReturnThis(),
                aggregate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                toArray: jest.fn(),
            }),
        };
        (connectToDatabase as jest.Mock).mockResolvedValue(mockDb);
    });

    describe('calculateStreak', () => {
        it('should calculate correct streak', async () => {
            const userId = 'user123';
            const mockStats = [
                { date: new Date() },
                { date: new Date(Date.now() - 86400000) },
                { date: new Date(Date.now() - 2 * 86400000) },
            ];

            mockDb.collection().toArray.mockResolvedValue(mockStats);

            const streak = await AnalyticsService.calculateStreak(userId);

            expect(typeof streak).toBe('number');
            expect(streak).toBeGreaterThanOrEqual(0);
        });

        it('should return 0 for no activity', async () => {
            mockDb.collection().toArray.mockResolvedValue([]);

            const streak = await AnalyticsService.calculateStreak('user123');

            expect(streak).toBe(0);
        });
    });

    describe('getSummaryStats', () => {
        it('should calculate summary statistics', () => {
            const wordProgress = [
                { mastery: 1.0, streak: 5 },
                { mastery: 0.5, streak: 2 },
                { mastery: 0.3, streak: 1 },
            ] as any;

            const allAttempts = [
                { score: 0.8 },
                { score: 0.9 },
            ] as any;

            const summary = AnalyticsService.getSummaryStats(wordProgress, allAttempts, 3);

            expect(summary.totalWords).toBe(3);
            expect(summary.masteredWords).toBe(1);
            expect(summary.needsReview).toBe(2);
            expect(summary.currentStreak).toBe(3);
            expect(summary.totalQuizzesTaken).toBe(2);
            expect(summary.avgScore).toBeCloseTo(0.85);
        });
    });
});
