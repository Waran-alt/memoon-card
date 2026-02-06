/**
 * @file i18n middleware utilities.
 * 
 * Utilities specifically for internationalization middleware:
 * - Locale detection from URL, cookies, and headers
 * - Locale validation and normalization
 * - i18n-specific request analysis
 */

import { getAcceptLanguageValues, getFirstPathSegment } from '@/middleware/utils';
import { NextRequest } from 'next/server';
import { DEFAULT_LOCALE } from './constants';
import { getLocaleFromCookieHeader } from './storage';
import { isSupportedLocale } from './utils';

// ============================================================================
// LOCALE DETECTION
// ============================================================================

/**
 * Get locale from URL pathname.
 * @param pathname - URL pathname (e.g., "/en/page-name")
 * @returns Extracted locale or undefined
 */
export function getLocaleFromPathname(pathname: string): string | undefined {
  const firstSegment = getFirstPathSegment(pathname);
  
  if (firstSegment && isSupportedLocale(firstSegment)) {
    return firstSegment;
  }
  
  return undefined;
}

/**
 * Get locale from request headers (Accept-Language).
 * @param request - Next.js request object
 * @returns Detected locale or undefined
 */
export function getLocaleFromHeaders(request: NextRequest): string | undefined {
  const languages = getAcceptLanguageValues(request);
  
  for (const lang of languages) {
    // Prefer exact match
    if (isSupportedLocale(lang)) return lang;
    // Fallback to language base (e.g., "fr-CA" -> "fr")
    const base = lang.split('-')[0]?.toLowerCase();
    if (base && isSupportedLocale(base)) return base;
  }
  
  return undefined;
}

/**
 * Determine target locale for redirect.
 * Priority: query param → cookie → headers → default
 * @param request - Next.js request object
 * @returns Target locale for redirect
 */
export function determineTargetLocale(request: NextRequest): string {
  // Check query parameter
  const queryLocale = request.nextUrl.searchParams.get('lang');
  if (queryLocale && isSupportedLocale(queryLocale)) {
    return queryLocale;
  }
  
  // Check cookie
  const cookieLocale = getLocaleFromCookieHeader(request.headers.get('cookie') || undefined);
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }
  
  // Check Accept-Language header
  const headerLocale = getLocaleFromHeaders(request);
  if (headerLocale) {
    return headerLocale;
  }
  
  // Fallback to default
  return DEFAULT_LOCALE;
}

// ============================================================================
// LOCALE VALIDATION
// ============================================================================

/**
 * Check if a pathname already has a locale prefix.
 * @param pathname - URL pathname to check
 * @returns True if pathname has locale prefix
 */
export function hasLocalePrefix(pathname: string): boolean {
  return getLocaleFromPathname(pathname) !== undefined;
}

/**
 * Remove locale prefix from pathname.
 * @param pathname - URL pathname (e.g., "/en/svg-test")
 * @returns Pathname without locale (e.g., "/svg-test")
 */
export function removeLocalePrefix(pathname: string): string {
  const firstSegment = getFirstPathSegment(pathname);
  
  if (firstSegment && isSupportedLocale(firstSegment)) {
    // Remove the leading "/{locale}" while preserving a single leading slash
    const afterLocale = pathname.slice(1 + firstSegment.length); // Slice after "/{locale}"
    if (afterLocale.startsWith('/')) {
      // Has additional path after the locale
      return afterLocale.length > 1 ? afterLocale : '/';
    }
    // Nothing after the locale (e.g., "/fr")
    return '/';
  }
  
  return pathname;
}

/**
 * Add locale prefix to pathname.
 * @param pathname - URL pathname (e.g., "/svg-test")
 * @param locale - Locale to add (e.g., "fr")
 * @returns Pathname with locale (e.g., "/fr/svg-test")
 */
export function addLocalePrefix(pathname: string, locale: string): string {
  return `/${locale}${pathname}`;
}
