'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LANGUAGES, removeLocalePrefix, useLocale } from 'i18n';

export function LanguageSwitcher() {
  const pathname = usePathname();
  const { locale: currentLocale } = useLocale();
  const pathWithoutLocale = removeLocalePrefix(pathname);

  return (
    <nav className="flex gap-2" aria-label="Language">
      {LANGUAGES.map((lang) => {
        const href = `/${lang.code}${pathWithoutLocale}`;
        const isActive = currentLocale === lang.code;
        return (
          <Link
            key={lang.code}
            href={href}
            className={`rounded px-2 py-1 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100'
                : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
            aria-current={isActive ? 'true' : undefined}
          >
            {lang.flag} {lang.nativeName}
          </Link>
        );
      })}
    </nav>
  );
}
