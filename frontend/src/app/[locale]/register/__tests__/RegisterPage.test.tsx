import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import RegisterPage from '../page';

const mockPost = vi.hoisted(() => vi.fn());
const mockSetAuthSuccess = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { post: mockPost },
  getApiErrorMessage: (err: unknown, fallback: string) =>
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
      : fallback,
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { setAuthSuccess: typeof mockSetAuthSuccess }) => unknown) =>
    selector({ setAuthSuccess: mockSetAuthSuccess }),
}));

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

const originalWindowLocation = window.location;

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockLocation = {
      href: '',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: mockLocation,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalWindowLocation,
    });
  });

  it('blocks submit when password is too short', async () => {
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/^Email/), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/Password/), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits normalized payload and stores auth on success', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          accessToken: 'token-2',
          user: { id: 'u2', email: 'user@example.com', name: 'New User' },
        },
      },
    });

    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/^Email/), '  USER@Example.Com ');
    await userEvent.type(screen.getByLabelText(/Password/), 'StrongPass123!');
    await userEvent.type(screen.getByLabelText(/Username/), '  New User ');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/auth/register', {
        email: 'user@example.com',
        password: 'StrongPass123!',
        name: 'New User',
        trustDevice: false,
      });
    });
    expect(mockSetAuthSuccess).toHaveBeenCalled();
    expect(window.location.href).toBe('/en/app');
  });
});
