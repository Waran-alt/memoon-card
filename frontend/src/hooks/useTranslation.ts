'use client';

import { getBestLocale, I18N_CONFIG, type SupportedNamespace } from 'i18n';
import { useEffect, useState } from 'react';

interface TranslationData {
  [key: string]: string | TranslationData;
}

export type InterpolationVariables = Record<string, string | number | boolean>;

export type TranslationFunction = (
  key: string,
  options?: { fallback?: string; vars?: InterpolationVariables }
) => string;

export function useTranslation(
  namespace: SupportedNamespace = 'common',
  locale: string = I18N_CONFIG.defaultLocale
) {
  const normalizedLocale = getBestLocale(locale);
  const [translations, setTranslations] = useState<TranslationData>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import(`../../public/locales/${normalizedLocale}/${namespace}.json`);
        if (!cancelled) setTranslations(mod as unknown as TranslationData);
      } catch (err) {
        try {
          const fallbackMod = await import(
            `../../public/locales/${I18N_CONFIG.fallbackLocale}/${namespace}.json`
          );
          if (!cancelled) setTranslations(fallbackMod as unknown as TranslationData);
        } catch {
          if (!cancelled) setTranslations({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedLocale, namespace]);

  const t: TranslationFunction = (key, options) => {
    const fallback = options?.fallback;
    const vars = options?.vars;
    const keys = key.split('.');
    let value: string | TranslationData | undefined = translations;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as TranslationData)[k] as string | TranslationData | undefined;
      } else {
        value = (fallback ?? key) as string;
        break;
      }
    }
    let result = typeof value === 'string' ? value : (fallback ?? key);
    if (vars && typeof result === 'string') {
      Object.entries(vars).forEach(([varKey, varValue]) => {
        result = result.replace(new RegExp(`{{${varKey}}}`, 'g'), String(varValue));
      });
    }
    return result;
  };

  return { t, locale: normalizedLocale, translations };
}
