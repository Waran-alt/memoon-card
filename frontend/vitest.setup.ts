/**
 * Vitest setup: matchers and global mocks for Next.js and i18n
 */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import enCommon from './public/locales/en/common.json';
import enApp from './public/locales/en/app.json';

const enStrings: Record<string, string> = { ...enCommon, ...enApp };

// Mock next/navigation (useRouter, usePathname, redirect, etc.)
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  redirect: vi.fn(),
}));

// Simple plural category for English (CLDR: one when n is 1, other otherwise)
function pluralCategoryEn(count: number): string {
  return count === 1 ? 'one' : 'other';
}

// Stable t function so effect deps (e.g. [id, ta]) don't change every render and refire effects
function mockT(key: string, opts?: { vars?: Record<string, string | number>; count?: number }) {
  const vars = { ...opts?.vars };
  if (typeof opts?.count === 'number') vars.count = opts.count;

  let s: string;
  if (typeof opts?.count === 'number' && !key.includes('.')) {
    const category = pluralCategoryEn(opts.count);
    const pluralKey = `${key}_${category}`;
    s = enStrings[pluralKey] ?? enStrings[`${key}_other`] ?? enStrings[key] ?? key;
  } else {
    s = enStrings[key] ?? key;
  }
  if (vars && typeof s === 'string') {
    Object.entries(vars).forEach(([k, v]) => {
      s = s.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
    });
  }
  return s;
}

// Mock useTranslation so components show English strings (from en locale JSON) in tests
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: (_ns: string, _locale?: string) => ({
    t: mockT,
    locale: 'en',
  }),
}));
