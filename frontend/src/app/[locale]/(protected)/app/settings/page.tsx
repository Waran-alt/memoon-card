'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/Button';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

const SETTINGS_URL = '/api/user/settings';

export default function SettingsPage() {
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
        <Link href={`/${locale}/app`} className="text-sm font-medium text-(--mc-text-secondary) hover:text-(--mc-text-primary)">
          ← {ta('backToDecks')}
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-(--mc-text-primary)">
          {ta('settingsTitle') !== 'settingsTitle' ? ta('settingsTitle') : 'Settings'}
        </h2>
        <p className="mt-1 text-sm text-(--mc-text-secondary)">
          {ta('settingsIntro') !== 'settingsIntro' ? ta('settingsIntro') : 'Manage your account and preferences.'}
        </p>
      </div>

      {/* Account */}
      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">
          {ta('settingsAccount') !== 'settingsAccount' ? ta('settingsAccount') : 'Account'}
        </h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">
          {ta('settingsAccountReadOnly') !== 'settingsAccountReadOnly'
            ? ta('settingsAccountReadOnly')
            : 'Account details are read-only here. Change email or password from the sign-in flow.'}
        </p>
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="text-xs font-medium text-(--mc-text-secondary)">
              {ta('settingsEmail') !== 'settingsEmail' ? ta('settingsEmail') : 'Email'}
            </dt>
            <dd className="mt-0.5 text-sm text-(--mc-text-primary)">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-(--mc-text-secondary)">
              {ta('settingsName') !== 'settingsName' ? ta('settingsName') : 'Name'}
            </dt>
            <dd className="mt-0.5 text-sm text-(--mc-text-primary)">{user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-(--mc-text-secondary)">
              {ta('settingsRole') !== 'settingsRole' ? ta('settingsRole') : 'Role'}
            </dt>
            <dd className="mt-0.5 text-sm text-(--mc-text-primary)">
              {user?.role === 'admin'
                ? tc('admin')
                : user?.role === 'dev'
                  ? tc('dev')
                  : ta('settingsRoleUser') !== 'settingsRoleUser'
                    ? ta('settingsRoleUser')
                    : 'User'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Theme */}
      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">
          {ta('settingsAppearance') !== 'settingsAppearance' ? ta('settingsAppearance') : 'Appearance'}
        </h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">
          {ta('settingsAppearanceHint') !== 'settingsAppearanceHint'
            ? ta('settingsAppearanceHint')
            : 'Choose a color theme. System follows your device light or dark mode.'}
        </p>
        <div className="mt-4 max-w-xs">
          <ThemeSwitcher id="theme-setting" compact={false} />
        </div>
      </section>

      {/* Study & knowledge */}
      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">
          {ta('settingsStudyPreferences') !== 'settingsStudyPreferences'
            ? ta('settingsStudyPreferences')
            : 'Study preferences'}
        </h3>
        <p className="mt-1 text-xs text-(--mc-text-secondary)">
          {ta('settingsStudyPreferencesHint') !== 'settingsStudyPreferencesHint'
            ? ta('settingsStudyPreferencesHint')
            : 'Optional features for card creation and learning units.'}
        </p>
        <form onSubmit={handleSubmit} className="mt-4">
          {error && <p className="mt-2 text-sm text-(--mc-accent-danger)" role="alert">{error}</p>}
          {saveSuccess && (
            <p className="mt-2 text-sm text-(--mc-accent-success)" role="status">
              {ta('settingsSaved') !== 'settingsSaved' ? ta('settingsSaved') : 'Saved.'}
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
              {ta('settingsKnowledgeEnabled') !== 'settingsKnowledgeEnabled' ? ta('settingsKnowledgeEnabled') : 'Enable knowledge and reversed cards'}
            </label>
          </div>
          <Button type="submit" variant="primary" className="mt-4" disabled={settingsLoading || saving}>
            {saving ? (tc('saving') !== 'saving' ? tc('saving') : 'Saving…') : ta('save') !== 'save' ? ta('save') : 'Save'}
          </Button>
        </form>
      </section>

      {/* Quick links */}
      <section className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-6 shadow-sm">
        <h3 className="text-sm font-medium text-(--mc-text-primary)">
          {ta('settingsQuickLinks') !== 'settingsQuickLinks' ? ta('settingsQuickLinks') : 'Quick links'}
        </h3>
        <ul className="mt-3 space-y-2">
          <li>
            <Link href={`/${locale}/app/study-health`} className="text-sm text-(--mc-accent-primary) underline hover:no-underline">
              {ta('viewStudyHealthDashboard') !== 'viewStudyHealthDashboard' ? ta('viewStudyHealthDashboard') : 'Study health dashboard'}
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
