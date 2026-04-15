'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LANGUAGES, removeLocalePrefix, useLocale } from 'i18n';
import { useTranslation } from '@/hooks/useTranslation';

const chipActive =
  'border-(--mc-accent-primary) bg-(--mc-accent-primary)/15 text-(--mc-text-primary)';
const chipInactive =
  'border-(--mc-border-subtle) text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)';

type Props = {
  /** `header`: compact row for the top bar. `panel`: stacked full-width for menus / settings. */
  layout?: 'header' | 'panel';
  className?: string;
};

export function LanguageSwitcher({ layout = 'header', className = '' }: Props) {
  const pathname = usePathname();
  const { locale: currentLocale } = useLocale();
  const { t: tc } = useTranslation('common', currentLocale);
  const pathWithoutLocale = removeLocalePrefix(pathname);
  const ariaLabel =
    tc('languageSwitcherAria') !== 'languageSwitcherAria' ? tc('languageSwitcherAria') : 'Language';
  const isPanel = layout === 'panel';

  return (
    <nav
      className={
        isPanel
          ? `flex w-full flex-col gap-2 ${className}`.trim()
          : `flex flex-wrap items-center justify-end gap-1 ${className}`.trim()
      }
      aria-label={ariaLabel}
    >
      {LANGUAGES.map((lang) => {
        const href = `/${lang.code}${pathWithoutLocale}`;
        const isActive = currentLocale === lang.code;
        const aria = `${lang.nativeName} (${lang.code})`;
        return (
          <Link
            key={lang.code}
            href={href}
            aria-label={aria}
            className={`mc-link-has-icon ${
              isPanel
                ? `block w-full rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors ${
                    isActive ? chipActive : chipInactive
                  }`
                : `rounded-md border px-2 py-1 text-xs font-medium transition-colors sm:text-sm ${
                    isActive ? chipActive : chipInactive
                  }`
            }`}
            aria-current={isActive ? 'true' : undefined}
          >
            <span className="inline-flex items-center justify-center gap-2" aria-hidden>
              <span className="shrink-0 select-none">{lang.flag}</span>
              {isPanel ? (
                <span className="mc-link-text">{lang.nativeName}</span>
              ) : (
                <>
                  <span className="mc-link-text hidden sm:inline">{lang.nativeName}</span>
                  <span className="mc-link-text sm:hidden">{lang.code.toUpperCase()}</span>
                </>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
