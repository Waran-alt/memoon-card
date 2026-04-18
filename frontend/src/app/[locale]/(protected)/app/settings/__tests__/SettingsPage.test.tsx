/**
 * Component tests for the Settings hub page (profile read-only, knowledge toggle, change password).
 *
 * Strategy:
 * - Mock `apiClient` (`get` / `patch` / `post`) to avoid real HTTP.
 * - Mock `useAuthStore` with a fixed `user` + spy `setAuthSuccess` — the page calls `setAuthSuccess`
 *   after a successful password change to swap the access token without a full reload.
 * - Mock `next/link` as a plain `<a>` for predictable href assertions.
 * - Stub `ThemeSwitcher` and `LanguageSwitcher` as null: they require `ThemeProvider` context which
 *   this test file intentionally avoids (focus is account + password flows).
 *
 * Locale: tests run under `LocaleProvider` from `@/test-utils` (default `en`), so copy matches en JSON.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../page';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
const mockSetAuthSuccess = vi.hoisted(() => vi.fn());

/** Minimal user row matching `AuthUser` shape used by the store + API response. */
const mockUser = {
  id: 'u1',
  email: 'user@test.com',
  name: 'Tester',
  role: 'user' as const,
};

vi.mock('@/lib/api', () => ({
  default: { get: mockGet, post: mockPost, patch: mockPatch },
  getApiErrorMessage: (err: unknown, fallback: string) =>
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
      : fallback,
  isRequestCancelled: () => false,
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (
    selector: (state: { user: typeof mockUser; setAuthSuccess: typeof mockSetAuthSuccess }) => unknown
  ) => selector({ user: mockUser, setAuthSuccess: mockSetAuthSuccess }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/ThemeSwitcher', () => ({
  ThemeSwitcher: () => null,
}));

vi.mock('@/components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => null,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `useEffect` on mount loads `/api/user/settings` for knowledge feature toggle initial state.
    mockGet.mockResolvedValue({
      data: { success: true, data: { knowledge_enabled: false } },
    });
  });

  it('loads settings and shows account email', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/user/settings');
    });
    expect(await screen.findByText('user@test.com')).toBeInTheDocument();
  });

  it('shows mismatch error when new password and confirmation differ', async () => {
    render(<SettingsPage />);
    await screen.findByText('user@test.com');

    await userEvent.type(screen.getByLabelText(/Current password/i), 'old-old-old');
    await userEvent.type(screen.getByLabelText(/^New password$/i), 'new-new-new');
    await userEvent.type(screen.getByLabelText(/Confirm new password/i), 'other-other-other');
    await userEvent.click(screen.getByRole('button', { name: /Update password/i }));

    // Client-side validation: no API call until passwords match and length >= shared minimum.
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits change password and refreshes auth on success', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          accessToken: 'new-access',
          user: { ...mockUser, email: 'user@test.com' },
        },
      },
    });

    render(<SettingsPage />);
    await screen.findByText('user@test.com');

    await userEvent.type(screen.getByLabelText(/Current password/i), 'old-old-old');
    await userEvent.type(screen.getByLabelText(/^New password$/i), 'new-new-new');
    await userEvent.type(screen.getByLabelText(/Confirm new password/i), 'new-new-new');
    await userEvent.click(screen.getByRole('button', { name: /Update password/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/user/change-password', {
        currentPassword: 'old-old-old',
        newPassword: 'new-new-new',
        trustDevice: false,
      });
    });
    expect(mockSetAuthSuccess).toHaveBeenCalledWith({
      accessToken: 'new-access',
      user: { ...mockUser, email: 'user@test.com' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(/Password updated/i);
  });
});
