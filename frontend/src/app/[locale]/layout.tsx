import { LocaleShell } from '@/app/[locale]/LocaleShell';
import { getBestLocale, HtmlAttributes, LocaleProvider } from 'i18n';
import type { Metadata } from 'next';
import React from 'react';

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'MemoOn Card',
    description: 'Spaced repetition flashcards',
    alternates: { languages: { en: '/en', fr: '/fr', 'x-default': '/' } },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: localeParam } = await params;
  const locale = getBestLocale(localeParam);
  return (
    <LocaleProvider initialLocale={locale}>
      <HtmlAttributes />
      <LocaleShell>{children}</LocaleShell>
    </LocaleProvider>
  );
}
