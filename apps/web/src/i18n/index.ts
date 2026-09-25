import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';

/** To add a language: add a JSON file under ./locales and register it here. */
export const resources = {
  en: { translation: en },
  'zh-TW': { translation: zhTW },
} as const;

export const supportedLanguages = Object.keys(resources);

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'cotebook.lang',
      caches: ['localStorage'],
      // Only Traditional Chinese is translated so far; use it for every Chinese variant.
      convertDetectedLanguage: (lng: string) =>
        lng.toLowerCase().startsWith('zh') ? 'zh-TW' : lng.split('-')[0]!,
    },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.resolvedLanguage ?? 'en';

export default i18n;
