'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { VALIDATION_LIMITS } from '@memoon-card/shared';

const { PASSWORD_MIN_LENGTH } = VALIDATION_LIMITS;

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const submittingRef = useRef(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const t = searchParams.get('token');
    if (t) setToken(t);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || !token) return;
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(tc('passwordMinLengthError', { vars: { count: PASSWORD_MIN_LENGTH } }));
      return;
    }
    if (password !== confirmPassword) {
      setError(ta('resetPasswordMismatch') !== 'resetPasswordMismatch' ? ta('resetPasswordMismatch') : 'Passwords do not match.');
      return;
    }
    submittingRef.current = true;
    setError('');
    setLoading(true);
    try {
      await apiClient.post('/api/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, ta('resetPasswordError')));
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  const title = ta('resetPasswordTitle') !== 'resetPasswordTitle' ? ta('resetPasswordTitle') : 'Set new password';
  const successMsg = ta('resetPasswordSuccess') !== 'resetPasswordSuccess' ? ta('resetPasswordSuccess') : 'Password has been reset. You can sign in with your new password.';
  const invalidMsg = ta('resetPasswordInvalidLink') !== 'resetPasswordInvalidLink' ? ta('resetPasswordInvalidLink') : 'Invalid or expired reset link. Please request a new one.';

  if (success) {
    return (
      <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-[var(--mc-bg-base)] p-6">
        <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
          <h1 className="text-center text-2xl font-bold text-[var(--mc-text-primary)]">{title}</h1>
          <p className="text-sm text-[var(--mc-text-secondary)]">{successMsg}</p>
          <Link href={`/${locale}/login`} className="block w-full rounded bg-[var(--mc-accent-success)] py-2 text-center text-sm font-medium text-white hover:opacity-90">{tc('signIn')}</Link>
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-[var(--mc-bg-base)] p-6">
        <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
          <h1 className="text-center text-2xl font-bold text-[var(--mc-text-primary)]">{title}</h1>
          <p className="text-sm text-[var(--mc-text-secondary)]">{invalidMsg}</p>
          <Link href={`/${locale}/forgot-password`} className="block w-full rounded bg-[var(--mc-accent-primary)] py-2 text-center text-sm font-medium text-white hover:opacity-90">{ta('forgotPasswordTitle') !== 'forgotPasswordTitle' ? ta('forgotPasswordTitle') : 'Forgot password'}</Link>
          <p className="text-center text-sm text-[var(--mc-text-secondary)]"><Link href={`/${locale}/login`} className="underline hover:no-underline">{tc('signIn')}</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-[var(--mc-bg-base)] p-6">
      <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-[var(--mc-text-primary)]">{title}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--mc-text-secondary)]">{tc('password')}</label>
            <input id="password" name="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} className="w-full rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-3 pt-1.5 pb-2 text-sm text-[var(--mc-text-primary)]" />
            <p className="mt-0.5 text-xs text-[var(--mc-text-secondary)]">{tc('passwordMinLength', { vars: { count: PASSWORD_MIN_LENGTH } })}</p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-[var(--mc-text-secondary)]">{ta('resetPasswordConfirm') !== 'resetPasswordConfirm' ? ta('resetPasswordConfirm') : 'Confirm password'}</label>
            <input id="confirmPassword" name="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} className="w-full rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-3 pt-1.5 pb-2 text-sm text-[var(--mc-text-primary)]" />
          </div>
          {error && <p className="text-sm text-[var(--mc-accent-danger)]" role="alert">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded bg-[var(--mc-accent-success)] pt-1.5 pb-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90">{ta('resetPasswordSubmit') !== 'resetPasswordSubmit' ? ta('resetPasswordSubmit') : 'Reset password'}</button>
        </form>
        <p className="text-center text-sm text-[var(--mc-text-secondary)]"><Link href={`/${locale}/login`} className="underline hover:no-underline">{tc('signIn')}</Link></p>
      </div>
    </main>
  );
}
