export function isChineseLanguage(code?: string): boolean {
  return code === 'zh' || (code?.startsWith('zh-') ?? false);
}

export function pinyinFieldForList(
  targetLanguage?: string,
  nativeLanguage?: string
): 'word' | 'translation' | null {
  if (isChineseLanguage(targetLanguage)) {
    return 'word';
  }
  if (isChineseLanguage(nativeLanguage)) {
    return 'translation';
  }
  return null;
}
