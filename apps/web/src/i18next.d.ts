/**
 * TypeScript declarations for i18next to provide strict typing for translation keys.
 */

import 'i18next'

import type { Translations } from './i18n.ts'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: Translations
    }
  }
}
