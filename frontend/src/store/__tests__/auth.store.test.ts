import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../auth.store';

describe('auth.store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isHydrated: false,
      reauthRequired: false,
    });
    vi.clearAllMocks();
  });

  describe('setUser / setAccessToken / setHydrated', () => {
    it('updates user', () => {
      const user = { id: '1', email: 'a@b.com', name: 'Alice' };
      useAuthStore.getState().setUser(user);
      expect(useAuthStore.getState().user).toEqual(user);
    });

    it('updates accessToken', () => {
      useAuthStore.getState().setAccessToken('token-123');
      expect(useAuthStore.getState().accessToken).toBe('token-123');
    });

    it('updates isHydrated', () => {
      useAuthStore.getState().setHydrated(true);
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });

  describe('setAuthSuccess', () => {
    it('sets user, accessToken, reauthRequired false, and marks hydrated', () => {
      useAuthStore.setState({ reauthRequired: true });
      const user = { id: '1', email: 'a@b.com', name: 'Alice' };
      useAuthStore.getState().setAuthSuccess({ accessToken: 'token-xyz', user });
      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().accessToken).toBe('token-xyz');
      expect(useAuthStore.getState().reauthRequired).toBe(false);
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });

  describe('setFromServer', () => {
    it('sets user and marks hydrated', () => {
      const user = { id: '1', email: 'a@b.com', name: null };
      useAuthStore.getState().setFromServer(user);
      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears user, accessToken, reauthRequired and sets isHydrated true', () => {
      useAuthStore.setState({
        user: { id: '1', email: 'a@b.com', name: 'A' },
        accessToken: 'token',
        isHydrated: true,
        reauthRequired: true,
      });
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().reauthRequired).toBe(false);
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });

  describe('refreshAccess', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('sets reauthRequired and clears accessToken when refresh returns 401', async () => {
      useAuthStore.setState({ user: { id: '1', email: 'u@x.com', name: 'U' } });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ success: false })),
      }) as typeof fetch;
      const result = await useAuthStore.getState().refreshAccess();
      expect(result).toBeNull();
      expect(useAuthStore.getState().reauthRequired).toBe(true);
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().user).not.toBeNull();
    });

    it('does not set reauthRequired on 503 or network-style failures', async () => {
      useAuthStore.setState({ user: { id: '1', email: 'u@x.com', name: 'U' }, accessToken: 'keep' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve(''),
      }) as typeof fetch;
      const result = await useAuthStore.getState().refreshAccess();
      expect(result).toBeNull();
      expect(useAuthStore.getState().reauthRequired).toBe(false);
      expect(useAuthStore.getState().accessToken).toBe('keep');

      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const r2 = await useAuthStore.getState().refreshAccess();
      expect(r2).toBeNull();
      expect(useAuthStore.getState().reauthRequired).toBe(false);
    });

    it('sets accessToken and user and returns token when response is success', async () => {
      const user = { id: '1', email: 'a@b.com', name: 'A' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              data: { accessToken: 'new-token', user },
            })
          ),
      }) as typeof fetch;
      const result = await useAuthStore.getState().refreshAccess();
      expect(result).toBe('new-token');
      expect(useAuthStore.getState().accessToken).toBe('new-token');
      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().reauthRequired).toBe(false);
    });

    it('uses a single in-flight refresh when called concurrently (no parallel POST /refresh)', async () => {
      const user = { id: '1', email: 'a@b.com', name: 'A' };
      let resolveText!: (v: string) => void;
      const textPromise = new Promise<string>((r) => {
        resolveText = r;
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => textPromise,
      }) as typeof fetch;
      const p1 = useAuthStore.getState().refreshAccess();
      const p2 = useAuthStore.getState().refreshAccess();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      resolveText(
        JSON.stringify({
          success: true,
          data: { accessToken: 'shared-token', user },
        })
      );
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('shared-token');
      expect(r2).toBe('shared-token');
    });

    it('runs refresh through navigator.locks when available (cross-tab serialization)', async () => {
      const user = { id: '1', email: 'a@b.com', name: 'A' };
      const lockSpy = vi.fn((_name: string, _opts: unknown, cb: () => Promise<string | null>) => cb());
      const prevLocks = globalThis.navigator.locks;
      Object.defineProperty(globalThis.navigator, 'locks', {
        configurable: true,
        value: { request: lockSpy },
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              data: { accessToken: 'locked-token', user },
            })
          ),
      }) as typeof fetch;
      try {
        await useAuthStore.getState().refreshAccess();
        expect(lockSpy).toHaveBeenCalledWith(
          'memoon-auth-refresh',
          { mode: 'exclusive' },
          expect.any(Function)
        );
        expect(useAuthStore.getState().accessToken).toBe('locked-token');
      } finally {
        Object.defineProperty(globalThis.navigator, 'locks', {
          configurable: true,
          value: prevLocks,
        });
      }
    });
  });
});
