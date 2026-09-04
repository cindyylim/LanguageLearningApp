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
import { assertAllContentAllowed, ModerationError } from '../utils/moderation';

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
    (assertAllContentAllowed as jest.Mock).mockResolvedValue(undefined);
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

  it('throws when generateText receives empty OpenAI content', async () => {
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: '   ' } }],
    });

    await expect(
      AIService.generateQuestions(sampleWords, 'fr', 'en', 1, 'easy')
    ).rejects.toMatchObject({
      message: 'AI service temporarily unavailable',
      statusCode: 503,
    });

    expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
    expect(assertAllContentAllowed).toHaveBeenCalledTimes(1);
    expect(assertAllContentAllowed).toHaveBeenCalledWith(
      ['bonjour hello'],
      'Input'
    );
  });

  it('throws when input moderation fails on words', async () => {
    (assertAllContentAllowed as jest.Mock).mockRejectedValueOnce(
      new ModerationError('Input')
    );

    await expect(
      AIService.generateQuestions(sampleWords, 'fr', 'en', 1, 'easy')
    ).rejects.toBeInstanceOf(ModerationError);

    expect(assertAllContentAllowed).toHaveBeenCalledWith(
      ['bonjour hello'],
      'Input'
    );
    expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
  });

  it('throws when output moderation fails on generated questions', async () => {
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
            ]),
          },
        },
      ],
    });

    (assertAllContentAllowed as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ModerationError('Generated content'));

    await expect(
      AIService.generateQuestions(sampleWords, 'fr', 'en', 1, 'easy')
    ).rejects.toBeInstanceOf(ModerationError);

    expect(assertAllContentAllowed).toHaveBeenNthCalledWith(
      1,
      ['bonjour hello'],
      'Input'
    );
    expect(assertAllContentAllowed).toHaveBeenNthCalledWith(
      2,
      [
        'What is hello in French?',
        'bonjour',
        '',
        'bonjour',
        'merci',
      ],
      'Generated content'
    );
    expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
  });
});

describe('AIService.generateVocabularyList', () => {
  beforeEach(() => {
    mockChatCompletionsCreate.mockReset();
    (assertAllContentAllowed as jest.Mock).mockResolvedValue(undefined);
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

  it('returns empty array when output moderation fails on generated vocabulary list', async () => {
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

    (assertAllContentAllowed as jest.Mock).mockRejectedValueOnce(
      new ModerationError('Generated content')
    );

    const result = await AIService.generateVocabularyList('greetings', 'fr', 'en', 1);

    expect(result).toEqual([]);
    expect(assertAllContentAllowed).toHaveBeenCalledWith(
      ['bonjour', 'hello', ''],
      'Generated content'
    );
    expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
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
