import { assertContentAllowed } from './moderation';

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    moderations: {
      create: jest.fn().mockResolvedValue({
        results: [{
          flagged: false,
          categories: {},
          category_scores: {},
        }],
      }),
    },
  })),
}));

describe('moderation policy patterns', () => {
  it('blocks prompts requesting racial slurs', async () => {
    await expect(
      assertContentAllowed('racial slurs and hate speech vocabulary', 'Input')
    ).rejects.toMatchObject({
      message: expect.stringContaining("isn't allowed"),
      code: 'MODERATION_BLOCKED',
    });
  });

  it('blocks hate speech topic requests', async () => {
    await expect(
      assertContentAllowed('generate hate speech vocabulary list', 'Input')
    ).rejects.toMatchObject({
      code: 'MODERATION_BLOCKED',
    });
  });

  it('allows benign vocabulary topics', async () => {
    await expect(
      assertContentAllowed('travel, airport, hotel', 'Input')
    ).resolves.toBeUndefined();
  });
});
