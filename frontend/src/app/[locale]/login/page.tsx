'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import { useAuthStore } from '@/store/auth.store';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import type { AuthApiResponse } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';

export default function LoginPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const setAuthSuccess = useAuthStore((s) => s.setAuthSuccess);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await apiClient.post<AuthApiResponse | { success?: boolean; error?: string }>(
        '/api/auth/login',
        { email: email.trim().toLowerCase(), password }
      );

      if (data?.success && 'data' in data && data.data?.accessToken && data.data?.user) {
        setAuthSuccess({ accessToken: data.data.accessToken, user: data.data.user });
        router.push(`/${locale}/app`);
        router.refresh();
        return;
      }
      setError('error' in data && typeof data.error === 'string' ? data.error : tc('loginFailed'));
    } catch (err) {
      setError(getApiErrorMessage(err, tc('networkError')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">{ta('signInTitle')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              {tc('email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-600"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              {tc('password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-600"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-neutral-900 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {loading ? ta('signingIn') : tc('signIn')}
          </button>
        </form>
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          {tc('noAccount')}{' '}
          <Link href={`/${locale}/register`} className="underline hover:no-underline">
            {tc('register')}
          </Link>
        </p>
      </div>
    </main>
  );
}
