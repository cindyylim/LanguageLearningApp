import { AIService, RECOMMENDED_WORD_LIMIT } from './ai';
import { WordStatus, type UserProgress } from '../shared/types/index';
import {ObjectId} from 'mongodb';
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('AIService.generateRecommendations', () => {
  const defaultStats = { weakWordCount: 2, hasLowStreak: true };

  it('returns word IDs for new and learning words', async () => {
    const candidates: UserProgress[] = [
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439011',
        status: WordStatus.LEARNING,
        reviewCount: 2,
        streak: 1,
      },
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439012',
        status: WordStatus.MASTERED,
        reviewCount: 10,
        streak: 5,
      },
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439013',
        status: WordStatus.NEW,
        reviewCount: 0,
        streak: 0,
      },
    ];

    const result = await AIService.generateRecommendations('user1', candidates, defaultStats, []);

    expect(result.recommendedWords).toEqual([
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439013',
    ]);
    expect(result.focusAreas).toContain('vocabulary_review');
  });

  it('returns empty recommendedWords when there are no weak words', async () => {
    const candidates: UserProgress[] = [
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439011',
        status: WordStatus.MASTERED,
        reviewCount: 10,
        streak: 5,
      },
    ];

    const result = await AIService.generateRecommendations(
      'user1',
      candidates,
      { weakWordCount: 0, hasLowStreak: false },
      [{ wordId: '507f1f77bcf86cd799439011', score: 0.9, date: new Date() }]
    );

    expect(result.recommendedWords).toEqual([]);
    expect(result.focusAreas).not.toContain('vocabulary_review');
  });

  it('includes practice_questions when recent performance average is below 0.7', async () => {
    const candidates: UserProgress[] = [
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439011',
        status: WordStatus.MASTERED,
        reviewCount: 10,
        streak: 5,
      },
    ];
    const recentPerformance = [
      { wordId: '507f1f77bcf86cd799439011', score: 0.4, date: new Date() },
      { wordId: '507f1f77bcf86cd799439011', score: 0.6, date: new Date() },
    ];

    const result = await AIService.generateRecommendations(
      'user1',
      candidates,
      { weakWordCount: 0, hasLowStreak: false },
      recentPerformance
    );

    expect(result.focusAreas).toContain('practice_questions');
    expect(result.focusAreas).not.toContain('vocabulary_review');
    expect(result.focusAreas).not.toContain('consistency_building');
  });

  it('includes consistency_building when stats indicate a low streak', async () => {
    const candidates: UserProgress[] = [
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439011',
        status: WordStatus.MASTERED,
        reviewCount: 10,
        streak: 1,
      },
    ];
    const recentPerformance = [
      { wordId: '507f1f77bcf86cd799439011', score: 0.9, date: new Date() },
    ];

    const result = await AIService.generateRecommendations(
      'user1',
      candidates,
      { weakWordCount: 0, hasLowStreak: true },
      recentPerformance
    );

    expect(result.focusAreas).toContain('consistency_building');
    expect(result.focusAreas).not.toContain('vocabulary_review');
    expect(result.focusAreas).not.toContain('practice_questions');
  });

  it('prioritizes learning words by lastReviewed and caps recommendations', async () => {
    const candidates: UserProgress[] = [
      ...Array.from({ length: RECOMMENDED_WORD_LIMIT + 5 }, (_, index) => ({
        userId: 'user1',
        wordId: new ObjectId().toString(),
        status: WordStatus.NEW,
        reviewCount: 0,
        streak: 0,
        lastReviewed: new Date('2026-01-01'),
      })),
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439099',
        status: WordStatus.LEARNING,
        reviewCount: 2,
        streak: 1,
        lastReviewed: new Date('2026-01-02'),
      },
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439098',
        status: WordStatus.LEARNING,
        reviewCount: 2,
        streak: 1,
        lastReviewed: new Date('2026-02-01'),
      },
    ];

    const result = await AIService.generateRecommendations(
      'user1',
      candidates,
      { weakWordCount: candidates.length, hasLowStreak: true },
      []
    );

    expect(result.recommendedWords).toHaveLength(RECOMMENDED_WORD_LIMIT);
    expect(result.recommendedWords[0]).toBe('507f1f77bcf86cd799439098');
    expect(result.recommendedWords[1]).toBe('507f1f77bcf86cd799439099');
  });

  it('returns fallback recommendations when generation throws', async () => {
    const candidates: UserProgress[] = [
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439011',
        status: WordStatus.LEARNING,
        reviewCount: 10,
        streak: 5,
      },
    ];

    jest.spyOn(candidates, 'filter').mockImplementation(() => {
      throw new Error('Error generating recommendations');
    });

    const result = await AIService.generateRecommendations(
      'user1',
      candidates,
      defaultStats,
      []
    );

    expect(result.recommendedWords).toEqual([]);
    expect(result.focusAreas).toEqual(['general_practice']);
    expect(result.studyPlan).toBe('Continue with regular study routine');
    expect(result.estimatedTime).toBe(20);
  });
});
