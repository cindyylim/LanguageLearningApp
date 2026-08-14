import { AIService } from './ai';
import { WordStatus, type UserProgress } from '../shared/types/index';

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

    const result = await AIService.generateRecommendations('user1', userProgress, []);

    expect(result.recommendedWords).toEqual([]);
    expect(result.focusAreas).not.toContain('vocabulary_review');
  });
});
