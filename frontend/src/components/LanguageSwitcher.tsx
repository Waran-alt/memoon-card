'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LANGUAGES, removeLocalePrefix, useLocale } from 'i18n';
import { useTranslation } from '@/hooks/useTranslation';

export function LanguageSwitcher() {
  const pathname = usePathname();
  const { locale: currentLocale } = useLocale();
  const { t: tc } = useTranslation('common', currentLocale);
  const pathWithoutLocale = removeLocalePrefix(pathname);
  const ariaLabel =
    tc('languageSwitcherAria') !== 'languageSwitcherAria' ? tc('languageSwitcherAria') : 'Language';

  return (
    <nav
      className="flex flex-wrap items-center justify-end gap-1"
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
            className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors sm:text-sm ${
              isActive
                ? 'border-(--mc-accent-primary) bg-(--mc-accent-primary)/15 text-(--mc-text-primary)'
                : 'border-(--mc-border-subtle) text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)'
            }`}
            aria-current={isActive ? 'true' : undefined}
          >
            <span className="inline-flex items-center gap-1" aria-hidden>
              <span>{lang.flag}</span>
              <span className="hidden sm:inline">{lang.nativeName}</span>
              <span className="sm:hidden">{lang.code.toUpperCase()}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
