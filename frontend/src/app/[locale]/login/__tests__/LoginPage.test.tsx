import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import LoginPage from '../page';

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

describe('LoginPage', () => {
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

  it('submits normalized credentials and stores auth on success', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          accessToken: 'token-1',
          user: { id: 'u1', email: 'user@example.com', name: 'User' },
        },
      },
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/^Email/), '  USER@Example.Com  ');
    await userEvent.type(screen.getByLabelText(/Password/), 'MyPassword123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/auth/login', {
        email: 'user@example.com',
        password: 'MyPassword123!',
        trustDevice: false,
      });
    });
    expect(mockSetAuthSuccess).toHaveBeenCalledWith({
      accessToken: 'token-1',
      user: { id: 'u1', email: 'user@example.com', name: 'User' },
    });
    expect(window.location.href).toBe('/en/app');
  }, 15000);

  it('shows API error message on login failure', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { error: 'Invalid email or password' } },
    });

    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/^Email/), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/Password/), 'WrongPassword1!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
    expect(mockSetAuthSuccess).not.toHaveBeenCalled();
  }, 15000);
});
