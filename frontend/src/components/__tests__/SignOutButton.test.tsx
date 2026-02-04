import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from '../SignOutButton';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockLogout = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (s: { logout: () => void }) => void) =>
    selector({ logout: mockLogout }),
}));

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Sign out" text', () => {
    render(<SignOutButton />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls logout, router.push(/login), and router.refresh on click', async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('applies custom className when provided', () => {
    render(<SignOutButton className="custom-class" />);
    const btn = screen.getByRole('button', { name: /sign out/i });
    expect(btn).toHaveClass('custom-class');
  });
});
