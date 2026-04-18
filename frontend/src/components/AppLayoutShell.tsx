'use client';

/**
 * Authenticated shell: nav, mobile menu, deck sub-nav. Admin/dev nav items are UI only; APIs enforce roles (grid 1.7, 4.5).
 *
 * Sidebar: standard accounts (`role === 'user'`) see Library + Insights (Stats only). Optimizer and Study
 * health appear only for `admin` / `dev` (power-user tooling). URLs still work if bookmarked.
 *
 * Settings (profile, password, language, theme, study prefs, data) live at `/app/settings` and are reached
 * from the header user dropdown — no dedicated sidebar entry, to avoid two doors to the same page.
 * `/app/account` is kept as a redirect for older bookmarks.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, User } from 'lucide-react';
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

type NavItem = {
  path: string;
  labelKey:
    | 'decks'
    | 'categories'
    | 'flaggedCards'
    | 'importExport'
    | 'stats'
    | 'optimizer'
    | 'studyHealth'
    | 'admin'
    | 'dev';
};

const libraryNavGroup = {
  sectionKey: 'navSectionLibrary',
  items: [
    { path: '/app', labelKey: 'decks' as const },
    { path: '/app/categories', labelKey: 'categories' as const },
    { path: '/app/flagged-cards', labelKey: 'flaggedCards' as const },
    { path: '/app/import-export', labelKey: 'importExport' as const },
  ],
} as const;

/** FSRS optimizer + study-health dashboard: hidden from default `user` role in the sidebar. */
function insightsItemsForRole(role: string | undefined): NavItem[] {
  const base: NavItem[] = [{ path: '/app/stats', labelKey: 'stats' }];
  if (role === 'admin' || role === 'dev') {
    return [
      ...base,
      { path: '/app/optimizer', labelKey: 'optimizer' },
      { path: '/app/study-health', labelKey: 'studyHealth' },
    ];
  }
  return base;
}

/** Sidebar = Library + Insights (no Account/Settings — that's the header dropdown's job). */
function sidebarNavGroupsForRole(role: string | undefined) {
  return [libraryNavGroup, { sectionKey: 'navSectionInsights', items: insightsItemsForRole(role) }];
}

/** Admin nav item: only shown when user.role === 'admin' (user management). */
const adminNavItem = { path: '/app/admin', labelKey: 'admin' as const };
/** Dev nav item: only shown when user.role === 'dev' (technical panels, feature flags). */
const devNavItem = { path: '/app/dev', labelKey: 'dev' as const };

const SHELL_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--mc-accent-success) focus-visible:ring-offset-2 focus-visible:ring-offset-(--mc-bg-surface)';

/** Muted label + hover surface (sidebar rows, sign out, header user trigger). Pair with `transition-colors` on the control. */
const SHELL_MUTED_INTERACTIVE =
  'text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back) hover:text-(--mc-text-primary)';

/** Subtle inset outline on hover so active rows (same bg as inactive hover) still feel interactive. */
const SIDEBAR_ROW_HOVER_RING =
  'ring-1 ring-inset ring-transparent hover:ring-(--mc-border-subtle)';

/** Sidebar nav link / sign-out row: shared padding, type, motion, focus. */
const SIDEBAR_NAV_ROW = `relative rounded-md px-3 pt-1.5 pb-2 text-sm font-medium transition-[color,background-color,box-shadow] duration-150 ease-out ${SHELL_FOCUS_RING}`;

/**
 * Active row: left accent bar via `before:` pseudo so it sits flush with the rounded row
 * without shifting horizontal padding (avoids text re-flow between active/inactive states).
 */
const SIDEBAR_ACTIVE_BAR =
  'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-(--mc-accent-primary)';

function sidebarNavLinkClass(isActive: boolean) {
  return `${SIDEBAR_NAV_ROW} ${SIDEBAR_ROW_HOVER_RING} ${
    isActive
      ? `bg-(--mc-bg-card-back) text-(--mc-text-primary) ${SIDEBAR_ACTIVE_BAR}`
      : SHELL_MUTED_INTERACTIVE
  }`;
}

/** Decks home uses `/app`; `pathname.startsWith(\`/locale/app/\`)` would mark it active on every app page. */
function isSidebarNavActive(pathname: string, locale: string, path: string) {
  const href = `/${locale}${path}`;
  if (path === '/app') {
    return pathname === href || pathname.startsWith(`${href}/decks`);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
  // Reset menus on route change during render (avoids a post-commit setState
  // round-trip that would briefly show the new route with menus still open).
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
    setUserMenuOpen(false);
  }
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const user = useAuthStore((s) => s.user);
  /** Header renders before `AuthHydrate` runs `setFromServer`; use session user so the menu (incl. Account) works on first paint. */
  const headerUser = user ?? serverUser;
  const effectiveRole = user?.role ?? serverUser.role ?? 'user';
  const sidebarNavGroups = useMemo(() => sidebarNavGroupsForRole(effectiveRole), [effectiveRole]);
  const appBase = `/${locale}/app`;
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
            className={`rounded-md px-2 py-1 -ml-2 font-semibold text-(--mc-text-primary) transition-[color,background-color,box-shadow] duration-150 ease-out hover:bg-(--mc-bg-card-back) ${SIDEBAR_ROW_HOVER_RING} ${SHELL_FOCUS_RING}`}
          >
            {tc('appName')}
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-3" aria-label={tc('navSidebar')}>
          {sidebarNavGroups.map((group) => (
            <div key={group.sectionKey} className="flex flex-col gap-1">
              <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--mc-text-muted)">
                {tc(group.sectionKey)}
              </p>
              {group.items.map(({ path, labelKey }) => {
                const href = `/${locale}${path}`;
                const isActive = isSidebarNavActive(pathname, locale, path);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={sidebarNavLinkClass(isActive)}
                  >
                    {tc(labelKey)}
                  </Link>
                );
              })}
            </div>
          ))}
          {(effectiveRole === 'admin' || effectiveRole === 'dev') && (
            <div className="flex flex-col gap-1 border-t border-(--mc-border-subtle) pt-3">
              <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--mc-text-muted)">
                {tc('navSectionAdministration')}
              </p>
              {effectiveRole === 'admin' && (
                <Link
                  href={`/${locale}${adminNavItem.path}`}
                  onClick={() => setMenuOpen(false)}
                  className={sidebarNavLinkClass(isSidebarNavActive(pathname, locale, adminNavItem.path))}
                >
                  {tc(adminNavItem.labelKey)}
                </Link>
              )}
              {effectiveRole === 'dev' && (
                <Link
                  href={`/${locale}${devNavItem.path}`}
                  onClick={() => setMenuOpen(false)}
                  className={sidebarNavLinkClass(isSidebarNavActive(pathname, locale, devNavItem.path))}
                >
                  {tc(devNavItem.labelKey)}
                </Link>
              )}
            </div>
          )}
        </nav>
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
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--mc-border-subtle) transition-colors md:hidden ${SHELL_MUTED_INTERACTIVE} ${SHELL_FOCUS_RING}`}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span aria-hidden className="text-lg leading-none">
                  {menuOpen ? '×' : '☰'}
                </span>
              </button>
              <h1 className="min-w-0 truncate text-lg font-medium text-(--mc-text-primary)">{pageTitle}</h1>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              {!headerUser && <LanguageSwitcher />}
              {!headerUser && <ThemeSwitcher />}
              {headerUser && (
                <div ref={userMenuRef} className="relative">
                  <button
                    type="button"
                    id="user-account-trigger"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                    aria-controls="user-account-menu"
                    title={headerUser.email}
                    aria-label={`${headerUser.name || headerUser.email} — ${tc('navUserMenu')}`}
                    className={`inline-flex max-w-[min(100%,14rem)] items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors ${SHELL_MUTED_INTERACTIVE} ${SHELL_FOCUS_RING}`}
                    onClick={() => setUserMenuOpen((v) => !v)}
                  >
                    <span className="truncate">{headerUser.name || headerUser.email}</span>
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
                      className="absolute right-0 top-full z-50 mt-1 min-w-56 rounded-md border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-3 shadow-lg"
                    >
                      {/* Identity block: name on top, email beneath, so the user always knows which account is active. */}
                      <div className="mb-3 border-b border-(--mc-border-subtle) px-3 pb-3">
                        {headerUser.name && (
                          <div className="truncate text-sm font-medium text-(--mc-text-primary)">
                            {headerUser.name}
                          </div>
                        )}
                        <div
                          className="truncate text-xs text-(--mc-text-secondary)"
                          title={headerUser.email}
                        >
                          {headerUser.email}
                        </div>
                      </div>
                      <Link
                        href={`/${locale}/app/settings`}
                        className={`mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-(--mc-text-primary) transition-colors hover:bg-(--mc-bg-card-back) ${SHELL_FOCUS_RING}`}
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <User className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                        <span>{tc('settings')}</span>
                      </Link>
                      <div className="mb-2 text-xs font-medium text-(--mc-text-secondary)">
                        {tc('languageSwitcherAria')}
                      </div>
                      <LanguageSwitcher layout="panel" className="mb-4" />
                      <div className="mb-2 text-xs font-medium text-(--mc-text-secondary)">{ta('themeSwitcherAria')}</div>
                      <ThemeSwitcher id="header-theme-switcher" compact={false} className="w-full min-w-48" />
                      <div className="mt-3 border-t border-(--mc-border-subtle) pt-3">
                        <SignOutButton
                          className={`block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${SHELL_MUTED_INTERACTIVE} ${SHELL_FOCUS_RING}`}
                        />
                      </div>
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
