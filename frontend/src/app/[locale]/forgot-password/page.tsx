'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

export default function ForgotPasswordPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const submittingRef = useRef(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/${locale}` : '';
      await apiClient.post('/api/auth/forgot-password', {
        email: email.trim().toLowerCase(),
        ...(baseUrl ? { resetLinkBaseUrl: baseUrl } : {}),
      });
      setSent(true);
    } catch (err) {
      setError(getApiErrorMessage(err, ta('forgotPasswordError')));
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  const title = ta('forgotPasswordTitle') !== 'forgotPasswordTitle' ? ta('forgotPasswordTitle') : 'Forgot password';
  const hint = ta('forgotPasswordHint') !== 'forgotPasswordHint' ? ta('forgotPasswordHint') : "Enter your email and we'll send you a link to reset your password.";
  const successMessage = ta('forgotPasswordSuccess') !== 'forgotPasswordSuccess' ? ta('forgotPasswordSuccess') : "If an account exists for this email, you will receive a password reset link.";
  const backToLogin = ta('forgotPasswordBackToLogin') !== 'forgotPasswordBackToLogin' ? ta('forgotPasswordBackToLogin') : 'Back to sign in';

  return (
    <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-[var(--mc-bg-base)] p-6">
      <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-[var(--mc-text-primary)]">{title}</h1>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--mc-text-secondary)]">{successMessage}</p>
            <Link href={`/${locale}/login`} className="block w-full rounded bg-[var(--mc-accent-primary)] py-2 text-center text-sm font-medium text-white hover:opacity-90">
              {backToLogin}
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--mc-text-secondary)]">{hint}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--mc-text-secondary)]">
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
                  className="w-full rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-3 pt-1.5 pb-2 text-sm text-[var(--mc-text-primary)]"
                />
              </div>
              {error && <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">{error}</p>}
              <button type="submit" disabled={loading} className="w-full rounded bg-[var(--mc-accent-success)] pt-1.5 pb-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90">
                {ta('forgotPasswordSubmit') !== 'forgotPasswordSubmit' ? ta('forgotPasswordSubmit') : 'Send reset link'}
              </button>
            </form>
            <p className="text-center text-sm text-[var(--mc-text-secondary)]">
              <Link href={`/${locale}/login`} className="underline hover:no-underline">{backToLogin}</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
