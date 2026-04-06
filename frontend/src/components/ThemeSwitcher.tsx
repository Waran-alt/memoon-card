'use client';

import { useMemo } from 'react';
import { useLocale } from 'i18n';
import { useTranslation } from '@/hooks/useTranslation';
import { useTheme } from '@/components/ThemeProvider';
import { McSelect } from '@/components/ui/McSelect';
import { THEME_OPTIONS, type ThemeSetting } from '@/theme';

type Props = {
  id?: string;
  className?: string;
  /** Narrow control for the app header; wider in settings. */
  compact?: boolean;
};

export function ThemeSwitcher({ id = 'theme-switcher', className = '', compact = true }: Props) {
  const { locale } = useLocale();
  const { t: ta } = useTranslation('app', locale);
  const { theme, setTheme } = useTheme();

  const label = ta('themeSwitcherAria') !== 'themeSwitcherAria' ? ta('themeSwitcherAria') : 'Theme';

  const optionLabel = (t: ThemeSetting) => {
    switch (t) {
      case 'light':
        return ta('themeLight');
      case 'dark':
        return ta('themeDark');
      case 'monokai':
        return ta('themeMonokai');
      default:
        return ta('themeSystem');
    }
  };

  const options = useMemo(
    () => THEME_OPTIONS.map((t) => ({ value: t, label: optionLabel(t) })),
    [ta]
  );

  /** Inline: `w-auto min-w-32`; settings: full width. */
  const sizeClass = compact ? 'w-auto min-w-32' : 'w-full';

  return (
    <McSelect
      id={id}
      value={theme}
      onChange={(v) => setTheme(v as ThemeSetting)}
      options={options}
      ariaLabel={label}
      className={`${sizeClass} ${className}`.trim()}
    />
  );
}
