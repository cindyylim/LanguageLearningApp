jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockModerationsCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    moderations: {
      create: mockModerationsCreate,
    },
  })),
}));

import { assertContentAllowed } from './moderation';

describe('moderation', () => {
  beforeEach(() => {
    mockModerationsCreate.mockReset();
  });

  it('blocks content flagged by OpenAI', async () => {
    mockModerationsCreate.mockResolvedValue({
      results: [
        {
          flagged: true,
          categories: { hate: true },
          category_scores: { hate: 0.9 },
        },
      ],
    });

    await expect(
      assertContentAllowed('some harmful content', 'Input')
    ).rejects.toMatchObject({
      message: expect.stringContaining("isn't allowed"),
      code: 'MODERATION_BLOCKED',
    });
    expect(mockModerationsCreate).toHaveBeenCalledTimes(1);
  });

  it('blocks content exceeding category score threshold', async () => {
    mockModerationsCreate.mockResolvedValue({
      results: [
        {
          flagged: false,
          categories: {},
          category_scores: { hate: 0.5 },
        },
      ],
    });

    await expect(
      assertContentAllowed('borderline content', 'Input')
    ).rejects.toMatchObject({
      code: 'MODERATION_BLOCKED',
    });
  });

  it('allows benign vocabulary topics', async () => {
    mockModerationsCreate.mockResolvedValue({
      results: [
        {
          flagged: false,
          categories: {},
          category_scores: {},
        },
      ],
    });

    await expect(
      assertContentAllowed('travel, airport, hotel', 'Input')
    ).resolves.toBeUndefined();
    expect(mockModerationsCreate).toHaveBeenCalledTimes(1);
  });
});
