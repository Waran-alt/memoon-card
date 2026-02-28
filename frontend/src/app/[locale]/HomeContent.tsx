'use client';

import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from 'i18n';

export function HomeContent() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);

  return (
    <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-(--mc-bg-base) p-6">
      <div className="z-10 max-w-lg w-full text-center space-y-8">
        <h1 className="text-4xl font-bold text-(--mc-text-primary)">{tc('appName')}</h1>
        <p className="text-lg text-(--mc-text-secondary)">{ta('tagline')}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/${locale}/register`}
            className="rounded bg-(--mc-accent-success) px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {tc('createAccount')}
          </Link>
          <Link
            href={`/${locale}/login`}
            className="rounded border border-(--mc-border-subtle) px-6 py-3 text-sm font-medium text-(--mc-text-primary) hover:bg-(--mc-bg-card-back) transition-colors duration-200"
          >
            {tc('signIn')}
          </Link>
        </div>
      </div>
    </main>
  );
}
