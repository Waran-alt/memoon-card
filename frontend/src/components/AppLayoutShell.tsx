'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from 'i18n';
import { useAuthStore } from '@/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { SignOutButton } from './SignOutButton';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Nav items visible to all authenticated users. */
const userNavItems = [
  { path: '/app', labelKey: 'decks' as const },
  { path: '/app/stats', labelKey: 'stats' as const },
  { path: '/app/categories', labelKey: 'categories' as const },
  { path: '/app/flagged-cards', labelKey: 'flaggedCards' as const },
  { path: '/app/optimizer', labelKey: 'optimizer' as const },
  { path: '/app/study-sessions', labelKey: 'studySessions' as const },
  { path: '/app/study-health', labelKey: 'studyHealth' as const },
  { path: '/app/settings', labelKey: 'settings' as const },
] as const;

/** Admin nav item: only shown when user.role === 'admin' (user management). */
const adminNavItem = { path: '/app/admin', labelKey: 'admin' as const };
/** Dev nav item: only shown when user.role === 'dev' (technical panels, feature flags). */
const devNavItem = { path: '/app/dev', labelKey: 'dev' as const };

export function AppLayoutShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const user = useAuthStore((s) => s.user);
  const appBase = `/${locale}/app`;
  const isDeckDetail = pathname.startsWith(`/${locale}/app/decks/`);
  const pageTitle =
    pathname === appBase
      ? tc('myDecks')
      : pathname === `/${locale}/app/stats`
        ? tc('stats')
        : pathname === `/${locale}/app/categories`
        ? tc('categories')
        : pathname === `/${locale}/app/optimizer`
          ? tc('optimizer')
          : pathname === `/${locale}/app/flagged-cards`
          ? tc('flaggedCards')
        : pathname === `/${locale}/app/study-sessions`
          ? tc('studySessions')
        : pathname === `/${locale}/app/study-health`
          ? tc('studyHealth')
        : pathname === `/${locale}/app/settings`
          ? tc('settings')
        : pathname === `/${locale}/app/admin`
          ? tc('admin')
        : pathname === `/${locale}/app/dev`
          ? tc('dev')
        : pathname.startsWith(`/${locale}/app/decks/`)
          ? tc('decks')
          : tc('appName');

  const focusRingClass =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mc-accent-success)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mc-bg-surface)]';

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.e2eShellReady = '0';
    root.dataset.e2eRoute = pathname;
    root.dataset.e2eLocale = locale;
    let raf2 = 0;

    // Mark ready after paint so E2E captures post-hydration layout.
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        root.dataset.e2eShellReady = '1';
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      delete root.dataset.e2eShellReady;
      delete root.dataset.e2eRoute;
      delete root.dataset.e2eLocale;
    };
  }, [locale, pathname]);

  return (
    <div className="flex min-h-screen bg-[var(--mc-bg-base)] text-[var(--mc-text-primary)]">
      {/* E2E style probes for layout audit (ensures Tailwind utilities are applied). */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] -top-[9999px]">
        <div id="e2e-style-probe-size" className="h-4 w-4" />
        <div id="e2e-style-probe-breakpoint" className="hidden md:block" />
      </div>

      <button
        type="button"
        aria-hidden={!menuOpen}
        aria-label="Close menu overlay"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)]/95 shadow-xl transition-transform md:static md:z-auto md:w-52 md:translate-x-0 md:shadow-none ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center border-b border-[var(--mc-border-subtle)] px-4">
          <Link
            href={appBase}
            onClick={() => setMenuOpen(false)}
            className={`font-semibold text-[var(--mc-text-primary)] ${focusRingClass}`}
          >
            {tc('appName')}
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {[...userNavItems, ...(user?.role === 'admin' ? [adminNavItem] : []), ...(user?.role === 'dev' ? [devNavItem] : [])].map(({ path, labelKey }) => {
            const href = `/${locale}${path}`;
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-md px-3 pt-1.5 pb-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--mc-bg-card-back)] text-[var(--mc-text-primary)]'
                    : 'text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)] hover:text-[var(--mc-text-primary)]'
                } ${focusRingClass}`}
              >
                {tc(labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--mc-border-subtle)] p-3">
          <SignOutButton
            className={`w-full rounded-md px-3 pt-1.5 pb-2 text-center text-sm text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)] hover:text-[var(--mc-text-primary)] ${focusRingClass}`}
          />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)]/70 px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--mc-border-subtle)] text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)] md:hidden ${focusRingClass}`}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span aria-hidden className="text-lg leading-none">
                {menuOpen ? '×' : '☰'}
              </span>
            </button>
            <h1 className="text-lg font-medium text-[var(--mc-text-primary)]">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user && (
              <span
                className="max-w-[12rem] truncate text-sm text-[var(--mc-text-secondary)]"
                title={user.email}
              >
                {user.name || user.email}
              </span>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {(() => {
            const deckStudyMatch = pathname.match(new RegExp(`^/${locale}/app/decks/([^/]+)/study$`));
            const deckOnlyMatch = pathname.match(new RegExp(`^/${locale}/app/decks/([^/]+)$`));
            const flaggedMatch = pathname === `/${locale}/app/flagged-cards`;
            const categoriesMatch = pathname === `/${locale}/app/categories`;
            let backHref: string | null = null;
            let backLabel: string | null = null;
            if (deckStudyMatch) {
              backHref = `/${locale}/app/decks/${deckStudyMatch[1]}`;
              backLabel = ta('backToDeck');
            } else if (deckOnlyMatch) {
              backHref = `/${locale}/app`;
              backLabel = ta('backToDecks');
            } else if (flaggedMatch || categoriesMatch) {
              backHref = `/${locale}/app`;
              backLabel = ta('backToDecks');
            }
            return (
              <>
                {backHref && backLabel && (
                  <div className="mb-4">
                    <Link
                      href={backHref}
                      className="text-sm font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)]"
                    >
                      ← {backLabel}
                    </Link>
                  </div>
                )}
                <div className="mx-auto w-full max-w-6xl">{children}</div>
              </>
            );
          })()}
        </main>
      </div>
    </div>
  );
}
