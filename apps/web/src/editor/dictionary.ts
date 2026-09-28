import * as locales from '@blocknote/core/locales';

/** BlockNote's own UI strings (slash menu, toolbar) for the current interface language. */
export function editorDictionary(lang: string) {
  if (lang.startsWith('zh')) return locales.zhTW;
  const short = lang.split('-')[0] as keyof typeof locales;
  return locales[short] ?? locales.en;
}
