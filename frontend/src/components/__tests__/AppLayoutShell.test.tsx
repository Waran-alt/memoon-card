import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
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
          stats: 'Stats',
          categories: 'Categories',
          flaggedCards: 'Flagged cards',
          importExport: 'Export / Import',
          optimizer: 'Optimizer',
          studyHealth: 'Stats & health',
          settings: 'Settings',
          accountAndData: 'Account & data',
          admin: 'Admin',
          dev: 'Dev',
          navCloseMenuOverlay: 'Close menu overlay',
          navCloseMenu: 'Close menu',
          navOpenMenu: 'Open menu',
          navUserMenu: 'Account menu',
          navSidebar: 'App navigation',
          navSectionLibrary: 'Library',
          navSectionInsights: 'Insights',
          navSectionAccount: 'Account',
          navSectionAdministration: 'Administration',
          languageSwitcherAria: 'Language',
          themeSwitcherAria: 'Theme',
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

type MockAuthUser = { email: string; name: string; role: 'user' | 'admin' | 'dev' };

const authStoreState = vi.hoisted(() => ({
  user: {
    email: 'user@example.com',
    name: 'User Name',
    role: 'admin' as const,
  } as MockAuthUser | null,
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: MockAuthUser | null }) => unknown) => selector(authStoreState),
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

function hasActiveSidebarBg(className: string) {
  return className.split(/\s+/).includes('bg-(--mc-bg-card-back)');
}

describe('AppLayoutShell', () => {
  beforeEach(() => {
    pathnameState.value = '/en/app';
    localeState.value = 'en';
    authStoreState.user = {
      email: 'user@example.com',
      name: 'User Name',
      role: 'admin',
    };
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

  it('shows settings link in header menu using server user when client store user is null', async () => {
    authStoreState.user = null;
    render(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(screen.getByRole('button', { name: 'User Name — Account menu' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'User Name — Account menu' }));
    const menu = screen.getByRole('region', { name: 'Account menu' });
    const settingsLink = within(menu).getByRole('link', { name: 'Settings' });
    expect(settingsLink).toHaveAttribute('href', '/en/app/settings');
  });

  it('hides optimizer and study health in sidebar for standard users', () => {
    authStoreState.user = {
      email: 'user@example.com',
      name: 'User Name',
      role: 'user',
    };
    const serverUser = { ...shellServerUser, role: 'user' as const };
    render(
      <AppLayoutShell serverUser={serverUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(screen.getByRole('link', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Optimizer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Stats & health' })).not.toBeInTheDocument();
  });

  it('does not keep Decks nav active on other /app/* routes (hover styles work)', () => {
    pathnameState.value = '/en/app/stats';
    render(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    const decks = screen.getByRole('link', { name: 'Decks' });
    const stats = screen.getByRole('link', { name: 'Stats' });
    expect(hasActiveSidebarBg(decks.className)).toBe(false);
    expect(hasActiveSidebarBg(stats.className)).toBe(true);
  });

  it('keeps Decks nav active on deck list and deck detail routes', () => {
    pathnameState.value = '/en/app/decks/abc';
    const { rerender } = render(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(hasActiveSidebarBg(screen.getByRole('link', { name: 'Decks' }).className)).toBe(true);

    pathnameState.value = '/en/app';
    rerender(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(hasActiveSidebarBg(screen.getByRole('link', { name: 'Decks' }).className)).toBe(true);
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
    expect(screen.queryByText('Language switcher')).not.toBeInTheDocument();
    // Sign out moved into the dropdown — it should no longer render at the shell root.
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User Name — Account menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MemoOn Card' })).toHaveAttribute('href', '/en/app');

    await userEvent.click(screen.getByRole('button', { name: 'User Name — Account menu' }));
    const userMenu = screen.getByRole('region', { name: 'Account menu' });
    expect(within(userMenu).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/en/app/settings'
    );
    expect(within(userMenu).getByText('user@example.com')).toBeInTheDocument();
    expect(within(userMenu).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByText('Language switcher')).toBeInTheDocument();
    expect(screen.getByText('Theme switcher')).toBeInTheDocument();
  });

  it('closes mobile menu when the route changes', async () => {
    pathnameState.value = '/en/app';
    const { rerender } = render(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');

    pathnameState.value = '/en/app/stats';
    rerender(
      <AppLayoutShell serverUser={shellServerUser}>
        <div>child</div>
      </AppLayoutShell>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
