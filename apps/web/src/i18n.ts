/**
 * i18next configuration: Browser-language detection and English fallback.
 * React escaping is disabled as React handles it by default.
 */

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

/** Derive the translation key type from the English base. */
export type Translations = typeof en

/** Supported languages with their i18n code and native display name. */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
] as const

/** Build the resource map from the language list so a new language only needs
 *  an import + an entry in `SUPPORTED_LANGUAGES`. */
const resources: Record<string, { translation: typeof en }> = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

export default i18n
