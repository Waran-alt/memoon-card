'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from 'i18n';

export function HomeContent() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="z-10 max-w-lg w-full text-center space-y-8">
        <h1 className="text-4xl font-bold">{tc('appName')}</h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">{ta('tagline')}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/${locale}/register`}
            className="rounded bg-neutral-900 px-6 py-3 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {tc('createAccount')}
          </Link>
          <Link
            href={`/${locale}/login`}
            className="rounded border border-neutral-300 px-6 py-3 text-sm font-medium dark:border-neutral-600"
          >
            {tc('signIn')}
          </Link>
        </div>
      </div>
    </main>
  );
}
