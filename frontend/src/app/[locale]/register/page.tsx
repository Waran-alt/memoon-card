'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import { useAuthStore } from '@/store/auth.store';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import type { AuthApiResponse } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { VALIDATION_LIMITS } from '@memoon-card/shared';

const { PASSWORD_MIN_LENGTH } = VALIDATION_LIMITS;

export default function RegisterPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const setAuthSuccess = useAuthStore((s) => s.setAuthSuccess);
  const submittingRef = useRef(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      submittingRef.current = false;
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiClient.post<AuthApiResponse | { success?: boolean; error?: string }>(
        '/api/auth/register',
        { email: email.trim().toLowerCase(), password, name: username.trim() || undefined }
      );

      if (data?.success && 'data' in data && data.data?.accessToken && data.data?.user) {
        setAuthSuccess({ accessToken: data.data.accessToken, user: data.data.user });
        router.push(`/${locale}/app`);
        return;
      }
      setError('error' in data && typeof data.error === 'string' ? data.error : tc('invalidResponse'));
    } catch (err) {
      setError(getApiErrorMessage(err, tc('registrationFailed')));
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-(--mc-bg-base) p-6">
      <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-(--mc-text-primary)">{tc('createAccount')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          <div>
            <label htmlFor="register-email" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
              {tc('email')}
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 pt-1.5 pb-2 text-sm text-(--mc-text-primary)"
            />
          </div>
          <div>
            <label htmlFor="register-name" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
              {tc('usernameOptional')}
            </label>
            <input
              id="register-name"
              name="name"
              type="text"
              autoComplete="name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 pt-1.5 pb-2 text-sm text-(--mc-text-primary)"
            />
          </div>
          <div>
            <label htmlFor="register-password" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
              {tc('passwordMinLength', { vars: { count: PASSWORD_MIN_LENGTH } })}
            </label>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 pt-1.5 pb-2 text-sm text-(--mc-text-primary)"
            />
          </div>
          {error && (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-(--mc-accent-success) pt-1.5 pb-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
          >
            {loading ? tc('creatingAccount') : tc('createAccount')}
          </button>
        </form>
        <p className="text-center text-sm text-(--mc-text-secondary)">
          {tc('hasAccount')}{' '}
          <Link href={`/${locale}/login`} className="underline hover:no-underline">
            {tc('signIn')}
          </Link>
        </p>
      </div>
    </main>
  );
}
