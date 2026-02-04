/**
 * Vitest setup: matchers and global mocks for Next.js
 */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
