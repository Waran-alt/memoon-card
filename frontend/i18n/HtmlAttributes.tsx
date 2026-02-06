'use client';

import { useEffect } from 'react';
import { LANGUAGES } from './constants';
import { useLocale } from './LocaleContext';

export function HtmlAttributes(): null {
  const { locale } = useLocale();

  useEffect(() => {
    const config = LANGUAGES.find((l) => l.code === locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = config?.rtl ? 'rtl' : 'ltr';
    document.querySelectorAll('link[rel="alternate"][data-i18n-hreflang="true"]').forEach((el) => el.parentNode?.removeChild(el));
    const segs = window.location.pathname.split('/').filter(Boolean);
    const base = segs.length > 1 ? '/' + segs.slice(1).join('/') : '/';
    LANGUAGES.forEach((l) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = l.code;
      link.href = `${window.location.origin}/${l.code}${base}`;
      link.setAttribute('data-i18n-hreflang', 'true');
      document.head.appendChild(link);
    });
    const def = document.createElement('link');
    def.rel = 'alternate';
    def.hreflang = 'x-default';
    def.href = `${window.location.origin}${base}`;
    def.setAttribute('data-i18n-hreflang', 'true');
    document.head.appendChild(def);
  }, [locale]);
  return null;
}
