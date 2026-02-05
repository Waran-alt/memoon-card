import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from '../SignOutButton';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockLogout = vi.fn();
const mockPost = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { logout: () => void }) => void) => selector({ logout: mockLogout }),
}));
vi.mock('@/lib/api', () => ({ default: { post: mockPost } }));

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Sign out" text', () => {
    render(<SignOutButton />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls logout API, logout, router.push(/login), and router.refresh on click', async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(mockPost).toHaveBeenCalledWith('/api/auth/logout');
    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('applies custom className when provided', () => {
    render(<SignOutButton className="custom-class" />);
    const btn = screen.getByRole('button', { name: /sign out/i });
    expect(btn).toHaveClass('custom-class');
  });

  it('still calls logout and redirects when logout API fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(mockPost).toHaveBeenCalledWith('/api/auth/logout');
    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(mockRefresh).toHaveBeenCalledOnce();
  });
});
