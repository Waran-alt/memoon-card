import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cross-locale parity guard. Whenever an English string is added/removed/renamed
 * in `public/locales/en/*.json`, this test forces the matching change in `fr/*.json`
 * (and any future locale file added to `LOCALES`). It also flags interpolation
 * placeholder mismatches like `{{count}}` being missing in a translation, which
 * silently produces literal `{{count}}` in the rendered UI.
 *
 * If a locale is *intentionally* allowed to fall back to English for a key (e.g.
 * brand names), keep both files at the same value — that's still parity.
 */

const LOCALES = ['en', 'fr'] as const;
const NAMESPACES = ['common', 'app'] as const;

function load(locale: string, ns: string): Record<string, unknown> {
  const path = join(process.cwd(), 'public', 'locales', locale, `${ns}.json`);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function placeholders(value: string): string[] {
  const matches = value.match(/{{[a-zA-Z_][a-zA-Z0-9_]*}}/g) ?? [];
  return [...new Set(matches)].sort();
}

describe('locale parity', () => {
  for (const ns of NAMESPACES) {
    const en = load('en', ns);
    const enKeys = Object.keys(en).sort();

    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const data = load(locale, ns);
      const localeKeys = Object.keys(data).sort();

      it(`${locale}/${ns}.json has the exact same keys as en/${ns}.json`, () => {
        const missing = enKeys.filter((k) => !(k in data));
        const extra = localeKeys.filter((k) => !(k in en));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });

      it(`${locale}/${ns}.json preserves every {{placeholder}} from en/${ns}.json`, () => {
        const drifts: Array<{ key: string; en: string[]; locale: string[] }> = [];
        for (const k of enKeys) {
          const ev = en[k];
          const lv = data[k];
          if (typeof ev !== 'string' || typeof lv !== 'string') continue;
          const ep = placeholders(ev);
          const lp = placeholders(lv);
          if (ep.join('|') !== lp.join('|')) {
            drifts.push({ key: k, en: ep, locale: lp });
          }
        }
        expect(drifts).toEqual([]);
      });
    }
  }
});
