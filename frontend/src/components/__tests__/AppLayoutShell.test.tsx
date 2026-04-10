import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { AppLayoutShell } from '../AppLayoutShell';

const pathnameState = vi.hoisted(() => ({ value: '/en/app' }));
const localeState = vi.hoisted(() => ({ value: 'en' }));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    usePathname: () => pathnameState.value,
  };
});

vi.mock('i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('i18n')>();
  return {
    ...actual,
    useLocale: () => ({ locale: localeState.value }),
  };
});

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          appName: 'MemoOn Card',
          myDecks: 'My decks',
          decks: 'Decks',
          categories: 'Categories',
          flaggedCards: 'Flagged cards',
          importExport: 'Export / Import',
          optimizer: 'Optimizer',
          studyHealth: 'Stats & health',
          settings: 'Settings',
          admin: 'Admin',
          dev: 'Dev',
          navCloseMenuOverlay: 'Close menu overlay',
          navCloseMenu: 'Close menu',
          navOpenMenu: 'Open menu',
          navUserMenu: 'Account menu',
          themeSwitcherAria: 'Theme',
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { email: string; name: string; role: string } | null }) => unknown) =>
    selector({ user: { email: 'user@example.com', name: 'User Name', role: 'admin' } }),
}));

vi.mock('../SignOutButton', () => ({
  SignOutButton: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      Sign out
    </button>
  ),
}));

vi.mock('../LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div>Language switcher</div>,
}));

vi.mock('../ThemeSwitcher', () => ({
  ThemeSwitcher: () => <div>Theme switcher</div>,
}));

vi.mock('../ConnectionSyncBanner', () => ({
  ConnectionSyncBanner: () => null,
}));

vi.mock('../AuthHydrate', () => ({
  AuthHydrate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const shellServerUser = { id: 'u1', email: 'user@example.com', name: 'User Name', role: 'admin' as const };

describe('AppLayoutShell', () => {
  beforeEach(() => {
    pathnameState.value = '/en/app';
    localeState.value = 'en';
  });

  afterEach(() => {
    delete document.documentElement.dataset.e2eShellReady;
    delete document.documentElement.dataset.e2eRoute;
    delete document.documentElement.dataset.e2eLocale;
  });

  it('renders page title based on route', () => {
    pathnameState.value = '/en/app/optimizer';
    const { rerender } = render(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(screen.getByRole('heading', { name: 'Optimizer' })).toBeInTheDocument();

    pathnameState.value = '/en/app/decks/abc123';
    rerender(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(screen.getByRole('heading', { name: 'Decks' })).toBeInTheDocument();

    pathnameState.value = '/en/app/study-health';
    rerender(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(screen.getByRole('heading', { name: 'Stats & health' })).toBeInTheDocument();
  });

  it('sets E2E readiness data attributes on document root', async () => {
    pathnameState.value = '/en/app';
    render(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );

    await waitFor(() => {
      expect(document.documentElement.dataset.e2eShellReady).toBe('1');
    });
    expect(document.documentElement.dataset.e2eRoute).toBe('/en/app');
    expect(document.documentElement.dataset.e2eLocale).toBe('en');
  });

  it('toggles mobile menu button state', async () => {
    render(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    const menuBtn = screen.getByRole('button', { name: 'Open menu' });
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(menuBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('shows app shell controls and user identity', async () => {
    render(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );

    expect(screen.queryByText('Theme switcher')).not.toBeInTheDocument();
    expect(screen.getByText('Language switcher')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User Name — Account menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MemoOn Card' })).toHaveAttribute('href', '/en/app');

    await userEvent.click(screen.getByRole('button', { name: 'User Name — Account menu' }));
    expect(screen.getByText('Theme switcher')).toBeInTheDocument();
  });
});
