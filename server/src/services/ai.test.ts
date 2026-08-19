const mockChatCompletionsCreate = jest.fn();

jest.mock('openai', () => {
  const actualOpenAI = jest.requireActual('openai').default;
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockChatCompletionsCreate,
      },
    },
  }));

  return {
    __esModule: true,
    default: Object.assign(MockOpenAI, actualOpenAI),
  };
});

jest.mock('../utils/moderation', () => ({
  assertContentAllowed: jest.fn().mockResolvedValue(undefined),
  assertAllContentAllowed: jest.fn().mockResolvedValue(undefined),
  ModerationError: jest.requireActual('../utils/moderation').ModerationError,
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { AIService } from './ai';

const sampleWords = [
  {
    _id: '507f1f77bcf86cd799439011',
    word: 'bonjour',
    translation: 'hello',
    partOfSpeech: 'interjection',
  },
];

describe('AIService.generateQuestions', () => {
  beforeEach(() => {
    mockChatCompletionsCreate.mockReset();
  });

  it('returns parsed questions from OpenAI response', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                question: 'What is hello in French?',
                type: 'multiple_choice',
                correctAnswer: 'bonjour',
                options: ['bonjour', 'merci'],
                difficulty: 'easy',
                wordId: '507f1f77bcf86cd799439011',
              },
              {
                question: 'Extra question',
                type: 'fill_blank',
                correctAnswer: 'merci',
                difficulty: 'easy',
              },
            ]),
          },
        },
      ],
    });

    const result = await AIService.generateQuestions(sampleWords, 'fr', 'en', 1, 'easy');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      question: 'What is hello in French?',
      correctAnswer: 'bonjour',
    });
    expect(mockChatCompletionsCreate).toHaveBeenCalled();
  });
});

describe('AIService.generateContextualSentences', () => {
  beforeEach(() => {
    mockChatCompletionsCreate.mockReset();
  });

  it('returns parsed contextual sentences', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                wordId: '507f1f77bcf86cd799439011',
                sentences: ['Bonjour!', 'Bonjour, comment ça va?'],
              },
            ]),
          },
        },
      ],
    });

    const result = await AIService.generateContextualSentences(sampleWords, 'fr');

    expect(result).toEqual([
      {
        wordId: '507f1f77bcf86cd799439011',
        sentences: ['Bonjour!', 'Bonjour, comment ça va?'],
      },
    ]);
  });
});

describe('AIService.generateVocabularyList', () => {
  beforeEach(() => {
    mockChatCompletionsCreate.mockReset();
  });

  it('returns parsed vocabulary entries', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                word: 'bonjour',
                translation: 'hello',
                partOfSpeech: 'interjection',
                difficulty: 'easy',
              },
            ]),
          },
        },
      ],
    });

    const result = await AIService.generateVocabularyList('greetings', 'fr', 'en', 1);

    expect(result).toEqual([
      {
        word: 'bonjour',
        translation: 'hello',
        partOfSpeech: 'interjection',
        difficulty: 'easy',
      },
    ]);
  });

    it('returns empty array after exhausting retries', async () => {
    const OpenAI = jest.requireActual('openai').default;
    mockChatCompletionsCreate.mockRejectedValue(
      new OpenAI.InternalServerError(500, {}, 'server error', {})
    );

    const result = await AIService.generateVocabularyList('greetings', 'fr', 'en', 1);

    expect(result).toEqual([]);
    expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(3);
  });
});

describe('AIService.healthCheck', () => {
  beforeEach(() => {
    mockChatCompletionsCreate.mockReset();
  });

  it('returns true when OpenAI responds with text', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: 'OK' } }],
    });

    await expect(AIService.healthCheck()).resolves.toBe(true);
  });

  it('throws when OpenAI health check fails', async () => {
    mockChatCompletionsCreate.mockRejectedValue(new Error('offline'));

    await expect(AIService.healthCheck()).rejects.toThrow();
  });
});

describe('AIService.generateRecommendations', () => {
  it('adds practice and consistency focus areas from recent performance', async () => {
    const { WordStatus } = require('../shared/types/index');
    const userProgress = [
      {
        userId: 'user1',
        wordId: '507f1f77bcf86cd799439011',
        status: WordStatus.LEARNING,
        reviewCount: 1,
        streak: 0,
      },
    ];
    const recentPerformance = [{ wordId: '507f1f77bcf86cd799439011', score: 0.4, date: new Date() }];

    const result = await AIService.generateRecommendations('user1', userProgress, recentPerformance);
 
    expect(result.focusAreas).toEqual(
      expect.arrayContaining(['vocabulary_review', 'practice_questions', 'consistency_building'])
    );
    expect(result.estimatedTime).toBe(45);
  });

    it('throws when OpenAI returns empty content', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    });

    await expect(
      AIService.generateQuestions(sampleWords, 'fr', 'en', 1, 'easy')
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(mockChatCompletionsCreate).toHaveBeenCalled();
  });

  it('returns fallback recommendations when recommendation generation fails', async () => {
    const { WordStatus } = require('../shared/types/index');
    const userProgress = [
      {
        get status() {
          throw new Error('progress read failed');
        },
        wordId: '507f1f77bcf86cd799439011',
        reviewCount: 1,
        streak: 0,
      },
    ];

    const result = await AIService.generateRecommendations(
      'user1',
      userProgress as any,
      []
    );

    expect(result).toEqual({
      focusAreas: ['general_practice'],
      recommendedWords: [],
      studyPlan: 'Continue with regular study routine',
      estimatedTime: 20,
    });
  });
});
