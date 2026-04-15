'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/Button';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const SETTINGS_URL = '/api/user/settings';

export default function AccountPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const user = useAuthStore((s) => s.user);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

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
        <p className="mt-1 text-xs text-(--mc-text-secondary)">{ta('accountPasswordResetHint')}</p>
        <p className="mt-4">
          <Link
            href={`/${locale}/forgot-password`}
            className="text-sm font-medium text-(--mc-accent-primary)"
          >
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
