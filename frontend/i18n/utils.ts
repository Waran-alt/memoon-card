import { DEFAULT_LOCALE, FALLBACK_LOCALE, LANGUAGES } from './constants';
import type { LanguageConfig } from './types';

export type SupportedLocale = (typeof LANGUAGES)[number]['code'];
export const SUPPORTED_LOCALES = LANGUAGES.map((l) => l.code) as SupportedLocale[];

export function getLanguageConfig(code: SupportedLocale): LanguageConfig | undefined {
  return LANGUAGES.find((lang) => lang.code === code);
}
export function getLanguageName(code: SupportedLocale): string {
  return getLanguageConfig(code)?.name ?? code;
}
export function getNativeLanguageName(code: SupportedLocale): string {
  return getLanguageConfig(code)?.nativeName ?? code;
}
export function isSupportedLocale(code: string): boolean {
  return SUPPORTED_LOCALES.includes(code as SupportedLocale);
}
export function getBestLocale(requestedLocale: string): SupportedLocale {
  if (isSupportedLocale(requestedLocale)) return requestedLocale;
  const part = requestedLocale.split('-')[0];
  if (part && isSupportedLocale(part)) return part;
  return DEFAULT_LOCALE;
}
export function getFallbackLocale(locale: SupportedLocale): SupportedLocale {
  return locale === FALLBACK_LOCALE ? DEFAULT_LOCALE : FALLBACK_LOCALE;
}
