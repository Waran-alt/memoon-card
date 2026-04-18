'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { VALIDATION_LIMITS } from '@memoon-card/shared';
import { Button, buttonClassName } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
      <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-(--mc-bg-base) p-6">
        <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
          <h1 className="text-center text-2xl font-bold text-(--mc-text-primary)">{title}</h1>
          <p className="text-sm text-(--mc-text-secondary)">{successMsg}</p>
          <Link
            href={`/${locale}/login`}
            className={buttonClassName({ variant: 'primary', className: 'w-full justify-center text-center' })}
          >
            {tc('signIn')}
          </Link>
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-(--mc-bg-base) p-6">
        <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
          <h1 className="text-center text-2xl font-bold text-(--mc-text-primary)">{title}</h1>
          <p className="text-sm text-(--mc-text-secondary)">{invalidMsg}</p>
          <Link href={`/${locale}/forgot-password`} className="block w-full rounded bg-(--mc-accent-primary) py-2 text-center text-sm font-medium text-white hover:opacity-90">{ta('forgotPasswordTitle') !== 'forgotPasswordTitle' ? ta('forgotPasswordTitle') : 'Forgot password'}</Link>
          <p className="text-center text-sm text-(--mc-text-secondary)"><Link href={`/${locale}/login`} className="font-medium text-(--mc-accent-primary)">{tc('signIn')}</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main className="mc-study-page flex min-h-screen flex-col items-center justify-center bg-(--mc-bg-base) p-6">
      <div className="mc-study-surface w-full max-w-sm space-y-6 rounded-xl border p-6 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-(--mc-text-primary)">{title}</h1>
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on" method="post" action="#">
          {/*
            Chrome Password Manager expects a username field before password fields to attach
            generated/saved passwords to this origin. Empty here; confirm uses new-password too
            so Chrome can fill both new-password slots.
          */}
          <input
            type="email"
            name="email"
            autoComplete="username"
            defaultValue=""
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">{tc('password')}</label>
            <div className="flex items-stretch gap-2">
              <input
                id="password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
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
            <p className="mt-0.5 text-xs text-(--mc-text-secondary)">{tc('passwordMinLength', { vars: { count: PASSWORD_MIN_LENGTH } })}</p>
            <PasswordStrengthMeter password={password} minLength={PASSWORD_MIN_LENGTH} t={tc} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-(--mc-text-secondary)">{ta('resetPasswordConfirm') !== 'resetPasswordConfirm' ? ta('resetPasswordConfirm') : 'Confirm password'}</label>
            <div className="flex items-stretch gap-2">
              <input
                id="confirmPassword"
                name="confirm-new-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm text-(--mc-text-primary)"
              />
              <button
                type="button"
                className="flex w-10 shrink-0 items-center justify-center rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-page) hover:text-(--mc-text-primary)"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? tc('hidePassword') : tc('showPassword')}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4 shrink-0" aria-hidden /> : <Eye className="h-4 w-4 shrink-0" aria-hidden />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Spinner size="xs" className="mr-1.5" />}
            {ta('resetPasswordSubmit') !== 'resetPasswordSubmit' ? ta('resetPasswordSubmit') : 'Reset password'}
          </Button>
        </form>
        <p className="text-center text-sm text-(--mc-text-secondary)"><Link href={`/${locale}/login`} className="font-medium text-(--mc-accent-primary)">{tc('signIn')}</Link></p>
      </div>
    </main>
  );
}
