'use client';

/**
 * Authenticated shell: nav, mobile menu, deck sub-nav. Admin/dev nav items are UI only; APIs enforce roles (grid 1.7, 4.5).
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from 'i18n';
import { useAuthStore } from '@/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import type { AuthUser } from '@/types';
import { AuthHydrate } from './AuthHydrate';
import { SignOutButton } from './SignOutButton';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';
import { ConnectionSyncBanner } from './ConnectionSyncBanner';

/** Nav items visible to all authenticated users. */
const userNavItems = [
  { path: '/app', labelKey: 'decks' as const },
  { path: '/app/stats', labelKey: 'stats' as const },
  { path: '/app/categories', labelKey: 'categories' as const },
  { path: '/app/flagged-cards', labelKey: 'flaggedCards' as const },
  { path: '/app/import-export', labelKey: 'importExport' as const },
  { path: '/app/optimizer', labelKey: 'optimizer' as const },
  { path: '/app/study-health', labelKey: 'studyHealth' as const },
  { path: '/app/settings', labelKey: 'settings' as const },
] as const;

/** Admin nav item: only shown when user.role === 'admin' (user management). */
const adminNavItem = { path: '/app/admin', labelKey: 'admin' as const };
/** Dev nav item: only shown when user.role === 'dev' (technical panels, feature flags). */
const devNavItem = { path: '/app/dev', labelKey: 'dev' as const };

export function AppLayoutShell({
  children,
  serverUser,
}: {
  children: React.ReactNode;
  serverUser: AuthUser;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
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
        : pathname === `/${locale}/app/import-export`
          ? tc('importExport')
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
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-success) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-surface)';

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-e2e-shell-ready', '0');
    root.dataset.e2eRoute = pathname;
    root.dataset.e2eLocale = locale;
    let raf2 = 0;

    // Mark ready after paint so E2E / audits see post-hydration layout.
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        root.setAttribute('data-e2e-shell-ready', '1');
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      root.removeAttribute('data-e2e-shell-ready');
      delete root.dataset.e2eRoute;
      delete root.dataset.e2eLocale;
    };
  }, [locale, pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = userMenuRef.current;
      if (el && !el.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  return (
    <div className="flex min-h-screen bg-(--mc-bg-base) text-(--mc-text-primary)">
      {/* E2E style probes for layout audit (ensures Tailwind utilities are applied). */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] -top-[9999px]">
        <div id="e2e-style-probe-size" className="h-4 w-4" />
        <div id="e2e-style-probe-breakpoint" className="hidden md:block" />
      </div>

      <button
        type="button"
        aria-hidden={!menuOpen}
        aria-label={tc('navCloseMenuOverlay')}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-(--mc-border-subtle) bg-(--mc-bg-surface)/95 shadow-xl transition-transform md:static md:z-auto md:w-52 md:translate-x-0 md:shadow-none ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center border-b border-(--mc-border-subtle) px-4">
          <Link
            href={appBase}
            onClick={() => setMenuOpen(false)}
            className={`font-semibold text-(--mc-text-primary) ${focusRingClass}`}
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
                    ? 'bg-(--mc-bg-card-back) text-(--mc-text-primary)'
                    : 'text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)'
                } ${focusRingClass}`}
              >
                {tc(labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-(--mc-border-subtle) p-3">
          <SignOutButton
            className={`w-full rounded-md px-3 pt-1.5 pb-2 text-center text-sm text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary) ${focusRingClass}`}
          />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="shrink-0 border-b border-(--mc-border-subtle) bg-(--mc-bg-surface)/70">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label={menuOpen ? tc('navCloseMenu') : tc('navOpenMenu')}
                aria-expanded={menuOpen}
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--mc-border-subtle) text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) md:hidden ${focusRingClass}`}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span aria-hidden className="text-lg leading-none">
                  {menuOpen ? '×' : '☰'}
                </span>
              </button>
              <h1 className="min-w-0 truncate text-lg font-medium text-(--mc-text-primary)">{pageTitle}</h1>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              <LanguageSwitcher />
              {!user && <ThemeSwitcher />}
              {user && (
                <div ref={userMenuRef} className="relative">
                  <button
                    type="button"
                    id="user-account-trigger"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                    aria-controls="user-account-menu"
                    title={user.email}
                    aria-label={`${user.name || user.email} — ${tc('navUserMenu')}`}
                    className={`inline-flex max-w-[min(100%,14rem)] items-center gap-1 rounded-md px-2 py-1.5 text-sm text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary) ${focusRingClass}`}
                    onClick={() => setUserMenuOpen((v) => !v)}
                  >
                    <span className="truncate">{user.name || user.email}</span>
                    <ChevronDown
                      aria-hidden
                      className={`h-4 w-4 shrink-0 opacity-70 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {userMenuOpen && (
                    <div
                      id="user-account-menu"
                      role="region"
                      aria-label={tc('navUserMenu')}
                      className="absolute right-0 top-full z-50 mt-1 min-w-[14rem] rounded-md border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-3 shadow-lg"
                    >
                      <div className="mb-2 text-xs font-medium text-(--mc-text-secondary)">{ta('themeSwitcherAria')}</div>
                      <ThemeSwitcher id="header-theme-switcher" compact={false} className="w-full min-w-[12rem]" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <ConnectionSyncBanner />
        <main className="flex-1 overflow-auto p-6">
          {(() => {
            const deckOnlyMatch = pathname.match(new RegExp(`^/${locale}/app/decks/([^/]+)$`));
            const flaggedMatch = pathname === `/${locale}/app/flagged-cards`;
            const categoriesMatch = pathname === `/${locale}/app/categories`;
            let backHref: string | null = null;
            let backLabel: string | null = null;
            // Study page provides its own exit control (clears saved session); avoid duplicate shell link.
            if (deckOnlyMatch) {
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
                      className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)"
                    >
                      ← {backLabel}
                    </Link>
                  </div>
                )}
                <div className="mx-auto w-full max-w-6xl">
                  <AuthHydrate serverUser={serverUser}>{children}</AuthHydrate>
                </div>
              </>
            );
          })()}
        </main>
      </div>
    </div>
  );
}
