'use client';

/**
 * Account & security page: read-only identity (from auth store), optional knowledge feature toggle,
 * theme/language controls, and authenticated password change.
 *
 * Password change calls `POST /api/user/change-password`; on success the API returns a new access token
 * and user payload — we call `setAuthSuccess` so the client session updates without a full reload.
 * Failed attempts surface API or validation messages via `getApiErrorMessage`.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { VALIDATION_LIMITS } from '@memoon-card/shared';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types';
import { Button } from '@/components/ui/Button';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const SETTINGS_URL = '/api/user/settings';
const CHANGE_PASSWORD_URL = '/api/user/change-password';
const { PASSWORD_MIN_LENGTH } = VALIDATION_LIMITS;

export default function AccountPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const user = useAuthStore((s) => s.user);
  const setAuthSuccess = useAuthStore((s) => s.setAuthSuccess);

  /** Knowledge panel feature flag (persisted in user_settings). */
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  /** Change-password form local state (not the same as login/register forms). */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  /** Mirrors login “trust this device” — forwarded to refresh token issuance on the server. */
  const [trustDevicePwd, setTrustDevicePwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);

  /** Hydrate knowledge toggle from settings API once on mount; ignore result if unmounted. */
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data?: { knowledge_enabled?: boolean } }>(SETTINGS_URL)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        if (data && typeof data.knowledge_enabled === 'boolean') {
          setKnowledgeEnabled(data.knowledge_enabled);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** PATCH only `knowledge_enabled` today; server returns full settings blob (we don’t need it for UI). */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaveSuccess(false);
    setSaving(true);
    try {
      await apiClient.patch(SETTINGS_URL, {
        knowledge_enabled: knowledgeEnabled,
      });
      setKnowledgeEnabled(knowledgeEnabled);
      setSaveSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, ta('settingsSaveError')));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Validates confirm + min length client-side (server still enforces Zod + policy).
   * Success path replaces Zustand auth so the new JWT is used immediately.
   */
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess(false);
    if (newPassword !== confirmPassword) {
      setPwdError(ta('accountChangePasswordMismatch'));
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPwdError(tc('passwordMinLengthError', { vars: { count: PASSWORD_MIN_LENGTH } }));
      return;
    }
    setPwdSaving(true);
    try {
      const { data } = await apiClient.post<{
        success: boolean;
        data?: { accessToken: string; user: AuthUser };
        error?: string;
      }>(CHANGE_PASSWORD_URL, {
        currentPassword,
        newPassword,
        trustDevice: trustDevicePwd,
      });
      if (data?.success && data.data?.accessToken && data.data?.user) {
        setAuthSuccess({ accessToken: data.data.accessToken, user: data.data.user });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPwdSuccess(true);
      } else {
        setPwdError(typeof data?.error === 'string' ? data.error : ta('accountChangePasswordError'));
      }
    } catch (err) {
      setPwdError(getApiErrorMessage(err, ta('accountChangePasswordError')));
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <div className="mc-study-page mx-auto max-w-2xl space-y-8">
      <div>
        <Link href={`/${locale}/app`}
          className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)"
        >
          ← {ta('backToDecks')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-(--mc-text-primary)">{ta('accountPageTitle')}</h2>
        <p className="mt-1 text-sm text-(--mc-text-secondary)">{ta('accountPageIntro')}</p>
      </div>

      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">
          {ta('settingsAccount') !== 'settingsAccount' ? ta('settingsAccount') : 'Account'}
        </h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('settingsAccountReadOnly')}</p>
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="text-xs font-medium text-(--mc-text-secondary)">{ta('settingsEmail')}</dt>
            <dd className="mt-0.5 text-sm text-(--mc-text-primary)">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-(--mc-text-secondary)">{ta('settingsName')}</dt>
            <dd className="mt-0.5 text-sm text-(--mc-text-primary)">{user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-(--mc-text-secondary)">{ta('settingsRole')}</dt>
            <dd className="mt-0.5 text-sm text-(--mc-text-primary)">
              {user?.role === 'admin'
                ? tc('admin')
                : user?.role === 'dev'
                  ? tc('dev')
                  : ta('settingsRoleUser')}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">{ta('accountSecurityTitle')}</h3>
        <h4 className="mt-4 text-sm font-medium text-(--mc-text-primary)">{ta('accountChangePasswordTitle')}</h4>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('accountChangePasswordIntro')}</p>
        <form onSubmit={handleChangePassword} className="mt-4 max-w-md space-y-3" autoComplete="on">
          {pwdError && (
            <p className="text-sm text-(--mc-accent-danger)" role="alert">
              {pwdError}
            </p>
          )}
          {pwdSuccess && (
            <p className="text-sm text-(--mc-accent-success)" role="status">
              {ta('accountChangePasswordSuccess')}
            </p>
          )}
          <div>
            <label htmlFor="account-current-password" className="mb-1 block text-xs font-medium text-(--mc-text-secondary)">
              {ta('accountCurrentPassword')}
            </label>
            <input
              id="account-current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 pt-1.5 pb-2 text-sm text-(--mc-text-primary)"
            />
          </div>
          <div>
            <label htmlFor="account-new-password" className="mb-1 block text-xs font-medium text-(--mc-text-secondary)">
              {ta('accountNewPassword')}
            </label>
            <input
              id="account-new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 pt-1.5 pb-2 text-sm text-(--mc-text-primary)"
            />
            <p className="mt-0.5 text-xs text-(--mc-text-muted)">{tc('passwordMinLength', { vars: { count: PASSWORD_MIN_LENGTH } })}</p>
          </div>
          <div>
            <label htmlFor="account-confirm-password" className="mb-1 block text-xs font-medium text-(--mc-text-secondary)">
              {ta('accountConfirmNewPassword')}
            </label>
            <input
              id="account-confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="off"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 pt-1.5 pb-2 text-sm text-(--mc-text-primary)"
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-(--mc-text-primary)">
            <input
              type="checkbox"
              checked={trustDevicePwd}
              onChange={(e) => setTrustDevicePwd(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-(--mc-border-subtle)"
            />
            <span>
              <span className="font-medium">{tc('trustThisDevice')}</span>
              <span className="mt-0.5 block text-xs text-(--mc-text-secondary)">{tc('trustThisDeviceHint')}</span>
            </span>
          </label>
          <Button type="submit" variant="primary" disabled={pwdSaving}>
            {pwdSaving ? tc('saving') : ta('accountChangePasswordSubmit')}
          </Button>
        </form>
        <p className="mt-6 text-xs text-(--mc-text-secondary)">{ta('accountPasswordResetHint')}</p>
        <p className="mt-2">
          <Link href={`/${locale}/forgot-password`} className="text-sm font-medium text-(--mc-accent-primary)">
            {ta('accountPasswordResetLink')}
          </Link>
        </p>
      </section>

      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">{ta('accountLanguageTitle')}</h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('accountLanguageHint')}</p>
        <div className="mt-4 max-w-xs">
          <LanguageSwitcher layout="panel" />
        </div>
      </section>

      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">{ta('settingsAppearance')}</h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('settingsAppearanceHint')}</p>
        <div className="mt-4 max-w-xs">
          <ThemeSwitcher id="theme-account" compact={false} />
        </div>
      </section>

      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">{ta('settingsStudyPreferences')}</h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('settingsStudyPreferencesHint')}</p>
        <form onSubmit={handleSubmit} className="mt-4">
          {error && (
            <p className="mt-2 text-sm text-(--mc-accent-danger)" role="alert">
              {error}
            </p>
          )}
          {saveSuccess && (
            <p className="mt-2 text-sm text-(--mc-accent-success)" role="status">
              {ta('settingsSaved')}
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              id="knowledge-enabled"
              type="checkbox"
              checked={knowledgeEnabled}
              onChange={(e) => setKnowledgeEnabled(e.target.checked)}
              disabled={settingsLoading}
              className="h-4 w-4 rounded border-(--mc-border-subtle)"
            />
            <label htmlFor="knowledge-enabled" className="text-sm text-(--mc-text-primary)">
              {ta('settingsKnowledgeEnabled')}
            </label>
          </div>
          <Button type="submit" variant="primary" className="mt-4" disabled={settingsLoading || saving}>
            {saving ? tc('saving') : tc('save')}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">{ta('accountDataTitle')}</h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('accountDataHint')}</p>
        <ul className="mt-4 space-y-2">
          <li>
            <Link
              href={`/${locale}/app/import-export`}
              className="text-sm text-(--mc-accent-primary)"
            >
              {tc('importExport')}
            </Link>
            <span className="mt-0.5 block text-xs text-(--mc-text-muted)">{ta('accountDataExportImportBlurb')}</span>
          </li>
          <li>
            <Link
              href={`/${locale}/app/stats`}
              className="text-sm text-(--mc-accent-primary)"
            >
              {tc('stats')}
            </Link>
          </li>
          <li>
            <Link
              href={`/${locale}/app/study-health`}
              className="text-sm text-(--mc-accent-primary)"
            >
              {ta('viewStudyHealthDashboard')}
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
