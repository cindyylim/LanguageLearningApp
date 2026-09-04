import request from 'supertest';
import express from 'express';

jest.mock('../services/analytics.service');

import analyticsRouter from './analytics';
import { AnalyticsService } from '../services/analytics.service';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 'test-user-id' };
  next();
});
app.use('/api/analytics', analyticsRouter);

describe('Analytics API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/progress', () => {
    it('returns learning progress for the authenticated user', async () => {
      const mockProgress = {
        summary: {},
        learningStats: {totalWords: 0, masteredWords: 0, needsReview: 0, currentStreak: 0, totalQuizzesTaken: 0, avgScore: 0},
        wordProgress: [],
        recentAttempts: []
      };
      (AnalyticsService.getProgress as jest.Mock).mockResolvedValue(mockProgress);

      const response = await request(app).get('/api/analytics/progress').expect(200);

      expect(response.body).toEqual(mockProgress);
      expect(AnalyticsService.getProgress).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('GET /api/analytics/recommendations', () => {
    it('returns AI recommendations for the authenticated user', async () => {
      const mockRecommendations = {
        recommendations: ['Continue with regular study routine'],
      };
      (AnalyticsService.getRecommendations as jest.Mock).mockResolvedValue(mockRecommendations);

      const response = await request(app).get('/api/analytics/recommendations').expect(200);

      expect(response.body).toEqual(mockRecommendations);
      expect(AnalyticsService.getRecommendations).toHaveBeenCalledWith('test-user-id');
    });
  });
});
