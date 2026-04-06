import type { ResolvedTheme } from './constants';

/**
 * Maps stored preference + system dark mode to the theme applied on `<html>`.
 * `system`, missing, or unknown values follow OS light/dark (never Monokai).
 */
export function resolveThemePreference(
  stored: string | null,
  prefersDark: boolean
): ResolvedTheme {
  if (stored === 'light' || stored === 'dark' || stored === 'monokai') {
    return stored;
  }
  return prefersDark ? 'dark' : 'light';
}
