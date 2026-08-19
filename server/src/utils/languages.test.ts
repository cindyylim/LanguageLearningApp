import { getLanguageName, isChineseLanguage } from './languages';

describe('languages', () => {
  it('returns known language names and falls back to code', () => {
    expect(getLanguageName('fr')).toBe('French');
    expect(getLanguageName('xx')).toBe('xx');
  });

  it('detects Chinese language codes', () => {
    expect(isChineseLanguage('zh')).toBe(true);
    expect(isChineseLanguage('zh-CN')).toBe(true);
    expect(isChineseLanguage('en')).toBe(false);
  });
});
