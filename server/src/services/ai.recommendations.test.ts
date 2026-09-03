import { AIService } from './ai';
import { WordStatus, type UserProgress } from '../shared/types/index';

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
  it('returns word IDs for new and learning words', async () => {
    const userProgress: UserProgress[] = [
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

    const result = await AIService.generateRecommendations('user1', userProgress, []);

    expect(result.recommendedWords).toEqual([
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439013',
    ]);
    expect(result.focusAreas).toContain('vocabulary_review');
  });

  it('returns empty recommendedWords when all words are mastered', async () => {
    const userProgress: UserProgress[] = [
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439011',
        status: WordStatus.MASTERED,
        reviewCount: 10,
        streak: 5,
      },
    ];

    const result = await AIService.generateRecommendations('user1', userProgress, [
      { wordId: '507f1f77bcf86cd799439011', score: 0.9, date: new Date() },
    ]);

    expect(result.recommendedWords).toEqual([]);
    expect(result.focusAreas).not.toContain('vocabulary_review');
  });

  it('includes practice_questions when recent performance average is below 0.7', async () => {
    const userProgress: UserProgress[] = [
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

    const result = await AIService.generateRecommendations('user1', userProgress, recentPerformance);

    expect(result.focusAreas).toContain('practice_questions');
    expect(result.focusAreas).not.toContain('vocabulary_review');
    expect(result.focusAreas).not.toContain('consistency_building');
  });

  it('includes consistency_building when any word has a streak below 2', async () => {
    const userProgress: UserProgress[] = [
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

    const result = await AIService.generateRecommendations('user1', userProgress, recentPerformance);

    expect(result.focusAreas).toContain('consistency_building');
    expect(result.focusAreas).not.toContain('vocabulary_review');
    expect(result.focusAreas).not.toContain('practice_questions');
  });

  it('returns fallback recommendations when generation throws', async () => {
    const userProgress: UserProgress[] = [
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439011',
        status: WordStatus.LEARNING,
        reviewCount: 10,
        streak: 5,
      },
    ];

    jest.spyOn(userProgress, 'filter').mockImplementation(() => {
      throw new Error('Error generating recommendations');
    });

    const result = await AIService.generateRecommendations('user1', userProgress, []);

    expect(result.recommendedWords).toEqual([]);
    expect(result.focusAreas).toEqual(['general_practice']);
    expect(result.studyPlan).toBe('Continue with regular study routine');
    expect(result.estimatedTime).toBe(20);
  });
});
