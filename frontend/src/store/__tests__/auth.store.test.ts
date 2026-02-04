import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../auth.store';

describe('auth.store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isHydrated: false,
    });
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

  describe('setFromServer', () => {
    it('sets user and marks hydrated', () => {
      const user = { id: '1', email: 'a@b.com', name: null };
      useAuthStore.getState().setFromServer(user);
      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears user and accessToken and sets isHydrated true', () => {
      useAuthStore.setState({
        user: { id: '1', email: 'a@b.com', name: 'A' },
        accessToken: 'token',
        isHydrated: true,
      });
      useAuthStore.getState().logout();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().isHydrated).toBe(true);
    });
  });

  describe('refreshAccess', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('calls logout and returns null when fetch fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      }) as typeof fetch;
      const result = await useAuthStore.getState().refreshAccess();
      expect(result).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().accessToken).toBeNull();
    });

    it('sets accessToken and user and returns token when response is success', async () => {
      const user = { id: '1', email: 'a@b.com', name: 'A' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { accessToken: 'new-token', user },
          }),
      }) as typeof fetch;
      const result = await useAuthStore.getState().refreshAccess();
      expect(result).toBe('new-token');
      expect(useAuthStore.getState().accessToken).toBe('new-token');
      expect(useAuthStore.getState().user).toEqual(user);
    });
  });
});
