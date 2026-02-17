import { describe, expect, it } from 'vitest';
import {
  addDays,
  addHours,
  formatIntervalMessage,
  getElapsedDays,
  getElapsedHours,
  isSameDay,
} from '@/services/fsrs-time.utils';

describe('fsrs-time utils', () => {
  it('computes elapsed days and hours', () => {
    const from = new Date('2026-02-01T00:00:00.000Z');
    const to = new Date('2026-02-02T12:00:00.000Z');
    expect(getElapsedDays(from, to)).toBeCloseTo(1.5, 6);
    expect(getElapsedHours(from, to)).toBeCloseTo(36, 6);
  });

  it('adds days and hours deterministically', () => {
    const base = new Date('2026-02-01T10:00:00.000Z');
    expect(addDays(base, 2).toISOString()).toBe('2026-02-03T10:00:00.000Z');
    expect(addHours(base, 5).toISOString()).toBe('2026-02-01T15:00:00.000Z');
  });

  it('checks same-day correctly', () => {
    const a = new Date(2026, 1, 1, 1, 0, 0);
    const b = new Date(2026, 1, 1, 23, 59, 59);
    const c = new Date(2026, 1, 2, 0, 0, 0);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });

  it('formats interval messages for hours/days/weeks/months', () => {
    expect(formatIntervalMessage(0.1)).toMatch(/Review in \d+ hour/);
    expect(formatIntervalMessage(1)).toBe('Review tomorrow');
    expect(formatIntervalMessage(3)).toBe('Review in 3 days');
    expect(formatIntervalMessage(10)).toMatch(/Review in \d+ week/);
    expect(formatIntervalMessage(45)).toMatch(/Review in \d+ month/);
  });
});
