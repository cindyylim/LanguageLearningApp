import { LearningStatsService } from './learningStats.service';
import { getDatabase } from '../utils/getDatabase';
import { toUtcStartOfDay } from '../utils/date';

jest.mock('../utils/getDatabase');

describe('LearningStatsService', () => {
  let mockFindOneAndUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';

    mockFindOneAndUpdate = jest.fn().mockResolvedValue({});
    (getDatabase as jest.Mock).mockResolvedValue({
      collection: jest.fn((name: string) => {
        if (name !== 'LearningStats') {
          throw new Error(`Unexpected collection: ${name}`);
        }
        return { findOneAndUpdate: mockFindOneAndUpdate };
      }),
    });
  });

  describe('updateDailyStats', () => {
    it('upserts daily stats with provided increments', async () => {
      const userId = 'user-123';
      const stats = {
        quizzesTaken: 2,
        wordsReviewed: 5,
        totalQuestions: 10,
        correctAnswers: 8,
      };

      await LearningStatsService.updateDailyStats(userId, stats);

      const startOfDay = toUtcStartOfDay();
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { userId, date: startOfDay },
        {
          $inc: {
            quizzesTaken: 2,
            wordsReviewed: 5,
            totalQuestions: 10,
            correctAnswers: 8,
          },
          $setOnInsert: {
            userId,
            date: startOfDay,
            createdAt: expect.any(Date),
          },
          $set: {
            updatedAt: expect.any(Date),
          },
        },
        { upsert: true }
      );
    });

    it('defaults missing stat fields to zero increments', async () => {
      const userId = 'user-123';

      await LearningStatsService.updateDailyStats(userId, { wordsReviewed: 3 });

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { userId, date: toUtcStartOfDay() },
        expect.objectContaining({
          $inc: {
            quizzesTaken: 0,
            wordsReviewed: 3,
            totalQuestions: 0,
            correctAnswers: 0,
          },
        }),
        { upsert: true }
      );
    });

    it('defaults all increments to zero when stats object is empty', async () => {
      const userId = 'user-123';

      await LearningStatsService.updateDailyStats(userId, {});

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $inc: {
            quizzesTaken: 0,
            wordsReviewed: 0,
            totalQuestions: 0,
            correctAnswers: 0,
          },
        }),
        { upsert: true }
      );
    });

    it('uses UTC start of day for the daily stats key', async () => {
      const userId = 'user-123';
      const now = new Date();
      const expectedStartOfDay = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      ));

      await LearningStatsService.updateDailyStats(userId, { quizzesTaken: 1 });

      const filter = mockFindOneAndUpdate.mock.calls[0][0];
      const setOnInsert = mockFindOneAndUpdate.mock.calls[0][1].$setOnInsert;

      expect(filter.date.toISOString()).toBe(expectedStartOfDay.toISOString());
      expect(setOnInsert.date.toISOString()).toBe(expectedStartOfDay.toISOString());
    });
  });
});
