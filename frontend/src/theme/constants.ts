/** localStorage key for theme preference (light | dark | monokai | system). */
export const THEME_STORAGE_KEY = 'memoon-theme';

export const THEME_OPTIONS = ['light', 'dark', 'monokai', 'system'] as const;

export type ThemeSetting = (typeof THEME_OPTIONS)[number];

/** Resolved theme applied to `document.documentElement` (`data-theme`). */
export type ResolvedTheme = 'light' | 'dark' | 'monokai';
