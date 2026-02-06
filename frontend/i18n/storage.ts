import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
} from './constants';
import type { SupportedLocale } from './utils';

export function saveLocaleToStorage(locale: SupportedLocale): boolean {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    return true;
  } catch (e) {
    console.error('Failed to save locale to localStorage:', e);
    return false;
  }
}

export function getLocaleFromStorage(): string | undefined {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) || undefined;
  } catch (e) {
    console.error('Failed to read locale from localStorage:', e);
    return undefined;
  }
}

export function clearLocaleFromStorage(): boolean {
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    return true;
  } catch (e) {
    console.error('Failed to clear locale from localStorage:', e);
    return false;
  }
}

export function saveLocaleToCookie(locale: SupportedLocale): boolean {
  try {
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Strict; Secure`;
    return true;
  } catch (e) {
    console.error('Failed to save locale to cookie:', e);
    return false;
  }
}

export function getLocaleFromCookie(): string | undefined {
  try {
    const match = document.cookie.match(
      new RegExp(`${LOCALE_COOKIE_NAME}=([^;]+)`)
    );
    return match?.[1];
  } catch (e) {
    console.error('Failed to read locale from cookie:', e);
    return undefined;
  }
}

export function clearLocaleFromCookie(): boolean {
  try {
    document.cookie = `${LOCALE_COOKIE_NAME}=; path=/; max-age=0`;
    return true;
  } catch (e) {
    console.error('Failed to clear locale from cookie:', e);
    return false;
  }
}

export function getLocaleFromCookieHeader(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(
    new RegExp(`${LOCALE_COOKIE_NAME}=([^;]+)`)
  );
  return match?.[1];
}
