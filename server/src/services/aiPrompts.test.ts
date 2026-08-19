import {
  buildContextualSentencesPrompt,
  buildQuestionsPrompt,
  buildVocabularyListPrompt,
} from './aiPrompts';

const sampleWords = [
  {
    _id: '507f1f77bcf86cd799439011',
    word: 'bonjour',
    translation: 'hello',
    partOfSpeech: 'interjection',
  },
  {
    _id: '507f1f77bcf86cd799439012',
    word: 'merci',
    translation: 'thank you',
  },
];

describe('buildQuestionsPrompt', () => {
  it('includes word metadata and generation settings', () => {
    const prompt = buildQuestionsPrompt(sampleWords, 'fr', 'en', 5, 'easy');

    expect(prompt).toContain('Generate 5 language learning questions');
    expect(prompt).toContain('Target language (language being learned): French');
    expect(prompt).toContain("Native language (learner's language for explanations): English");
    expect(prompt).toContain('Difficulty level: easy');
    expect(prompt).toContain('[ID: 507f1f77bcf86cd799439011] bonjour (hello) - interjection');
    expect(prompt).toContain('[ID: 507f1f77bcf86cd799439012] merci (thank you) - unknown');
    expect(prompt).toContain('"type": "multiple_choice|fill_blank|sentence_completion"');
  });
});

describe('buildContextualSentencesPrompt', () => {
  it('requests three contextual sentences per word in the target language', () => {
    const prompt = buildContextualSentencesPrompt(sampleWords, 'fr');

    expect(prompt).toContain('Generate 3 contextual sentences for each vocabulary word in French');
    expect(prompt).toContain('[ID: 507f1f77bcf86cd799439011] bonjour (hello)');
    expect(prompt).toContain('Sentence 1 in French');
    expect(prompt).toContain('"sentences"');
  });
});

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
