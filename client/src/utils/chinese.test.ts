import { isChineseLanguage, pinyinFieldForList } from './chinese';

describe('chinese utils', () => {
  describe('isChineseLanguage', () => {
    it('returns true for zh and zh variants', () => {
      expect(isChineseLanguage('zh')).toBe(true);
      expect(isChineseLanguage('zh-CN')).toBe(true);
    });

    it('returns false for other languages', () => {
      expect(isChineseLanguage('en')).toBe(false);
      expect(isChineseLanguage(undefined)).toBe(false);
    });
  });

  describe('pinyinFieldForList', () => {
    it('places pinyin on the word when target language is Chinese', () => {
      expect(pinyinFieldForList('zh', 'en')).toBe('word');
    });

    it('places pinyin on the translation when only native language is Chinese', () => {
      expect(pinyinFieldForList('en', 'zh')).toBe('translation');
    });

    it('returns null when neither language is Chinese', () => {
      expect(pinyinFieldForList('en', 'fr')).toBeNull();
    });
  });
});
