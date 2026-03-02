'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import type { AuthApiResponse } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

interface ReauthModalProps {
  locale: string;
}

export function ReauthModal({ locale }: ReauthModalProps) {
  const router = useRouter();
  const reauthRequired = useAuthStore((s) => s.reauthRequired);
  const user = useAuthStore((s) => s.user);
  const setAuthSuccess = useAuthStore((s) => s.setAuthSuccess);
  const logout = useAuthStore((s) => s.logout);

  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);

  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (reauthRequired && user?.email) setEmail(user.email);
  }, [reauthRequired, user?.email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const { data } = await apiClient.post<AuthApiResponse | { success?: boolean; error?: string }>(
        '/api/auth/login',
        { email: email.trim().toLowerCase(), password }
      );
      if (data?.success && 'data' in data && data.data?.accessToken && data.data?.user) {
        setAuthSuccess({ accessToken: data.data.accessToken, user: data.data.user });
        setPassword('');
        return;
      }
      setError('error' in data && typeof data.error === 'string' ? data.error : tc('loginFailed'));
    } catch (err) {
      setError(getApiErrorMessage(err, tc('networkError')));
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  function handleLogout() {
    logout();
    router.replace(`/${locale}/login`);
  }

  if (!reauthRequired) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
    >
      <div className="mc-study-surface w-full max-w-sm rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-6 shadow-lg">
        <h2 id="reauth-title" className="text-center text-lg font-semibold text-(--mc-text-primary)">
          {ta('reauthModalTitle')}
        </h2>
        <p className="mt-2 text-center text-sm text-(--mc-text-secondary)">
          {ta('reauthModalMessage')}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4" autoComplete="on">
          <div>
            <label htmlFor="reauth-email" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
              {tc('email')}
            </label>
            <input
              id="reauth-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-base) px-3 py-2 text-sm text-(--mc-text-primary)"
            />
          </div>
          <div>
            <label htmlFor="reauth-password" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
              {tc('password')}
            </label>
            <input
              id="reauth-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-base) px-3 py-2 text-sm text-(--mc-text-primary)"
            />
          </div>
          {error && (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-(--mc-accent-success) py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
            >
              {loading ? ta('signingIn') : ta('reauthSubmit')}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded border border-(--mc-border-subtle) py-2 text-sm font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-muted) hover:text-(--mc-text-primary)"
            >
              {ta('reauthLogout')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
