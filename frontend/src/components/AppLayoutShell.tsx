'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from 'i18n';
import { useAuthStore } from '@/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { SignOutButton } from './SignOutButton';

const navItems = [
  { path: '/app', labelKey: 'decks' as const },
  { path: '/app/optimizer', labelKey: 'optimizer' as const },
] as const;

export function AppLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const user = useAuthStore((s) => s.user);
  const appBase = `/${locale}/app`;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-52 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50">
        <div className="flex h-14 items-center border-b border-neutral-200 px-4 dark:border-neutral-800">
          <Link href={appBase} className="font-semibold text-neutral-900 dark:text-neutral-100">
            {tc('appName')}
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(({ path, labelKey }) => {
            const href = `/${locale}${path}`;
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                }`}
              >
                {tc(labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <SignOutButton className="w-full rounded-md px-3 py-2 text-center text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-6 dark:border-neutral-800">
          <h1 className="text-lg font-medium text-neutral-700 dark:text-neutral-300">
            {pathname === appBase ? tc('myDecks') : pathname === `/${locale}/app/optimizer` ? tc('optimizer') : tc('appName')}
          </h1>
          {user && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400" title={user.email}>
              {user.name || user.email}
            </span>
          )}
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
