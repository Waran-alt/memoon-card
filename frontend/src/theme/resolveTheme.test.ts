import { describe, expect, it } from 'vitest';
import { resolveThemePreference } from './resolveTheme';

describe('resolveThemePreference', () => {
  it('returns fixed themes as-is', () => {
    expect(resolveThemePreference('light', false)).toBe('light');
    expect(resolveThemePreference('light', true)).toBe('light');
    expect(resolveThemePreference('monokai', false)).toBe('monokai');
  });

  it('maps system and missing to OS preference', () => {
    expect(resolveThemePreference('system', false)).toBe('light');
    expect(resolveThemePreference('system', true)).toBe('dark');
    expect(resolveThemePreference(null, false)).toBe('light');
    expect(resolveThemePreference(null, true)).toBe('dark');
  });
});
