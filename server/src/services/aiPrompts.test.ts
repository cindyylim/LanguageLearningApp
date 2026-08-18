import { buildVocabularyListPrompt } from './aiPrompts';

describe('buildVocabularyListPrompt', () => {
  it('does not request pinyin for non-Chinese languages', () => {
    const prompt = buildVocabularyListPrompt('travel', 'fr', 'en', 10);

    expect(prompt).not.toContain('"pinyin"');
    expect(prompt).not.toContain('Hanyu Pinyin');
  });

  it('requests pinyin for the word field when target language is Chinese', () => {
    const prompt = buildVocabularyListPrompt('food', 'zh', 'en', 10);

    expect(prompt).toContain('"pinyin": "..."');
    expect(prompt).toContain('Chinese characters in the "word" field');
    expect(prompt).toContain('Hanyu Pinyin');
  });

  it('requests pinyin for the translation field when native language is Chinese', () => {
    const prompt = buildVocabularyListPrompt('food', 'en', 'zh', 10);

    expect(prompt).toContain('"pinyin": "..."');
    expect(prompt).toContain('Chinese characters in the "translation" field');
    expect(prompt).not.toContain('Chinese characters in the "word" field');
  });
});
