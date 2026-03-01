import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import { AuthHydrate } from '../AuthHydrate';

const mockSetFromServer = vi.hoisted(() => vi.fn());
const mockRefreshAccess = vi.hoisted(() => vi.fn().mockResolvedValue('token'));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: {
    setFromServer: typeof mockSetFromServer;
    refreshAccess: typeof mockRefreshAccess;
  }) => unknown) =>
    selector({
      setFromServer: mockSetFromServer,
      refreshAccess: mockRefreshAccess,
    }),
}));

describe('AuthHydrate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates store from server user and refreshes access once', async () => {
    const serverUser = { id: 'u1', email: 'user@example.com', name: 'User' };
    const { rerender } = render(
      <AuthHydrate serverUser={serverUser}>
        <div>child</div>
      </AuthHydrate>
    );

    expect(mockSetFromServer).toHaveBeenCalledWith(serverUser);
    expect(mockRefreshAccess).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText('child')).toBeInTheDocument();
    });

    // Same identity values with new object should not trigger a second refresh.
    rerender(
      <AuthHydrate serverUser={{ id: 'u1', email: 'user@example.com', name: 'Updated Name' }}>
        <div>child</div>
      </AuthHydrate>
    );
    expect(mockRefreshAccess).toHaveBeenCalledTimes(1);
  });

  it('does not refresh access when no server user', () => {
    render(
      <AuthHydrate serverUser={null}>
        <div>child</div>
      </AuthHydrate>
    );

    expect(mockSetFromServer).toHaveBeenCalledWith(null);
    expect(mockRefreshAccess).not.toHaveBeenCalled();
  });
});
