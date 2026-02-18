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
          optimizer: 'Optimizer',
          studySessions: 'Study sessions',
          studyHealth: 'Stats & health',
          admin: 'Admin',
          dev: 'Dev',
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
      <AppLayoutShell>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(screen.getByRole('heading', { name: 'Optimizer' })).toBeInTheDocument();

    pathnameState.value = '/en/app/decks/abc123';
    rerender(
      <AppLayoutShell>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(screen.getByRole('heading', { name: 'Decks' })).toBeInTheDocument();

    pathnameState.value = '/en/app/study-sessions';
    rerender(
      <AppLayoutShell>
        <div>child</div>
      </AppLayoutShell>
    );
    expect(screen.getByRole('heading', { name: 'Study sessions' })).toBeInTheDocument();
  });

  it('sets E2E readiness data attributes on document root', async () => {
    pathnameState.value = '/en/app';
    render(
      <AppLayoutShell>
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
      <AppLayoutShell>
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

  it('shows app shell controls and user identity', () => {
    render(
      <AppLayoutShell>
        <div>child</div>
      </AppLayoutShell>
    );

    expect(screen.getByText('Language switcher')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
    expect(screen.getByText('User Name')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MemoOn Card' })).toHaveAttribute('href', '/en/app');
  });
});
