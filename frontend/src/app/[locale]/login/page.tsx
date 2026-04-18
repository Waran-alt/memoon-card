'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useLocale } from 'i18n';
import { useAuthStore } from '@/store/auth.store';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import type { AuthApiResponse } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const setAuthSuccess = useAuthStore((s) => s.setAuthSuccess);
  const submittingRef = useRef(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const { data } = await apiClient.post<AuthApiResponse | { success?: boolean; error?: string }>(
        '/api/auth/login',
        { email: email.trim().toLowerCase(), password, trustDevice }
      );

      if (data?.success && 'data' in data && data.data?.accessToken && data.data?.user) {
        setAuthSuccess({ accessToken: data.data.accessToken, user: data.data.user });
        window.location.href = `/${locale}/app`;
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

  return (
    <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-(--mc-bg-base) p-6">
      <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-(--mc-text-primary)">{ta('signInTitle')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
              {tc('email')}
            </label>
            <input
              id="login-email"
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
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">
              {tc('password')}
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm text-(--mc-text-primary)"
              />
              <button
                type="button"
                className="flex w-10 shrink-0 items-center justify-center rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-page) hover:text-(--mc-text-primary)"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? tc('hidePassword') : tc('showPassword')}
              >
                {showPassword ? <EyeOff className="h-4 w-4 shrink-0" aria-hidden /> : <Eye className="h-4 w-4 shrink-0" aria-hidden />}
              </button>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-(--mc-text-primary)">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-(--mc-border-subtle)"
            />
            <span>
              <span className="font-medium">{tc('trustThisDevice')}</span>
              <span className="mt-0.5 block text-xs text-(--mc-text-secondary)">{tc('trustThisDeviceHint')}</span>
            </span>
          </label>
          {error && (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? ta('signingIn') : tc('signIn')}
          </Button>
        </form>
        <p className="text-center text-sm text-(--mc-text-secondary)">
          <Link href={`/${locale}/forgot-password`} className="font-medium text-(--mc-accent-primary)">
            {ta('forgotPassword')}
          </Link>
        </p>
        <p className="text-center text-sm text-(--mc-text-secondary)">
          {tc('noAccount')}{' '}
          <Link href={`/${locale}/register`} className="font-medium text-(--mc-accent-primary)">
            {tc('register')}
          </Link>
        </p>
      </div>
    </main>
  );
}
