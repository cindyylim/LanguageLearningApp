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

import { assertAllContentAllowed, assertContentAllowed, ModerationError } from './moderation';

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

  it('skips moderation for blank input', async () => {
    await expect(assertContentAllowed('   ', 'Input')).resolves.toBeUndefined();
    expect(mockModerationsCreate).not.toHaveBeenCalled();
  });

  it('uses generated-content messaging for output moderation failures', async () => {
    mockModerationsCreate.mockResolvedValue({
      results: [
        {
          flagged: true,
          categories: { violence: true },
          category_scores: { violence: 0.9 },
        },
      ],
    });

    await expect(assertContentAllowed('unsafe output', 'Generated content')).rejects.toMatchObject({
      message: expect.stringContaining("couldn't generate safe content"),
      code: 'MODERATION_BLOCKED',
    });
  });

  it('blocks when a category flag is set without flagged=true', async () => {
    mockModerationsCreate.mockResolvedValue({
      results: [
        {
          flagged: false,
          categories: { harassment: true },
          category_scores: { harassment: 0.01 },
        },
      ],
    });

    await expect(assertContentAllowed('harassing text', 'Input')).rejects.toBeInstanceOf(
      ModerationError
    );
  });

  it('throws when moderation API returns no results', async () => {
    mockModerationsCreate.mockResolvedValue({ results: [] });

    await expect(assertContentAllowed('anything', 'Input')).rejects.toThrow(
      'Moderation check returned no result.'
    );
  });
});

describe('assertAllContentAllowed', () => {
  beforeEach(() => {
    mockModerationsCreate.mockReset();
    mockModerationsCreate.mockResolvedValue({
      results: [
        {
          flagged: false,
          categories: {},
          category_scores: {},
        },
      ],
    });
  });

  it('moderates combined text and each non-empty segment', async () => {
    await assertAllContentAllowed([' travel ', '', 'airport'], 'Input');

    expect(mockModerationsCreate).toHaveBeenCalledTimes(3);
    expect(mockModerationsCreate).toHaveBeenNthCalledWith(1, {
      input: 'travel\nairport',
      model: expect.any(String),
    });
    expect(mockModerationsCreate).toHaveBeenNthCalledWith(2, {
      input: 'travel',
      model: expect.any(String),
    });
    expect(mockModerationsCreate).toHaveBeenNthCalledWith(3, {
      input: 'airport',
      model: expect.any(String),
    });
  });

  it('skips moderation when all segments are blank', async () => {
    await assertAllContentAllowed(['  ', ''], 'Input');
    expect(mockModerationsCreate).not.toHaveBeenCalled();
  });
});
