import { ensureIndexes } from './indexes';

jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import logger from './logger';

describe('ensureIndexes', () => {
  it('creates indexes for all collections', async () => {
    const createIndex = jest.fn().mockResolvedValue('ok');
    const db = {
      collection: jest.fn().mockReturnValue({ createIndex }),
    };

    await ensureIndexes(db as any);

    const expectedCollections = [
      'User',
      'VocabularyList',
      'Word',
      'WordProgress',
      'Quiz',
      'IdempotencyKey',
      'QuizQuestion',
      'QuizAttempt',
      'QuizAnswer',
      'LearningStats',
    ];

    for (const name of expectedCollections) {
      expect(db.collection).toHaveBeenCalledWith(name);
    }

    expect(createIndex).toHaveBeenCalledTimes(18);
    expect(logger.info).toHaveBeenCalledWith('All database indexes created successfully!');
  });

  it('logs and rethrows when index creation fails', async () => {
    const indexError = new Error('index conflict');
    const db = {
      collection: jest.fn().mockReturnValue({
        createIndex: jest.fn().mockRejectedValue(indexError),
      }),
    };

    await expect(ensureIndexes(db as any)).rejects.toThrow('index conflict');
    expect(logger.error).toHaveBeenCalledWith('Error creating indexes:', { error: indexError });
  });
});
