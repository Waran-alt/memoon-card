export * from './constants';
export * from './types';
export * from './utils';
export { HtmlAttributes } from './HtmlAttributes';
export { LocaleProvider, useLocale } from './LocaleContext';
export {
  clearLocaleFromCookie,
  clearLocaleFromStorage,
  getLocaleFromCookie,
  getLocaleFromCookieHeader,
  getLocaleFromStorage,
  saveLocaleToCookie,
  saveLocaleToStorage,
} from './storage';
export {
  addLocalePrefix,
  determineTargetLocale,
  getLocaleFromHeaders,
  getLocaleFromPathname,
  hasLocalePrefix,
  removeLocalePrefix,
} from './middleware';

import { DEFAULT_LOCALE, FALLBACK_LOCALE, LANGUAGES, NAMESPACES } from './constants';
import { SUPPORTED_LOCALES } from './utils';

export const I18N_CONFIG = Object.freeze({
  supportedLocales: SUPPORTED_LOCALES,
  fallbackLocale: FALLBACK_LOCALE,
  defaultLocale: DEFAULT_LOCALE,
  namespaces: NAMESPACES,
  languages: LANGUAGES,
} as const);

export type SupportedNamespace = (typeof NAMESPACES)[number];
