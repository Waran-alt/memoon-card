import type { LanguageConfig } from './types';

export const DEFAULT_LOCALE = 'en' as const;
export const FALLBACK_LOCALE = 'en' as const;
export const NAMESPACES = ['common', 'app'] as const;
export const LANGUAGES: LanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', rtl: false },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', rtl: false },
];
export const LOCALE_STORAGE_KEY = 'memoon-locale' as const;
export const LOCALE_COOKIE_NAME = 'memoon-locale' as const;
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const DEFAULT_LOCALIZED_HOME = '/' as const;
