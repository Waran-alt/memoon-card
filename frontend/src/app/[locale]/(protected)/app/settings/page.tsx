'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

const MIN_AWAY = 1;
const MAX_AWAY = 120;
const SETTINGS_URL = '/api/user/settings';

export default function SettingsPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const [awayMinutes, setAwayMinutes] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ success: boolean; data?: { session_auto_end_away_minutes: number } }>(SETTINGS_URL)
      .then((res) => {
        if (cancelled) return;
        const min = res.data?.data?.session_auto_end_away_minutes;
        if (typeof min === 'number' && min >= MIN_AWAY && min <= MAX_AWAY) {
          setAwayMinutes(min);
        }
      })
      .catch(() => {
        if (!cancelled) setAwayMinutes(5);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaveSuccess(false);
    const value = Math.max(MIN_AWAY, Math.min(MAX_AWAY, awayMinutes));
    setSaving(true);
    try {
      await apiClient.patch(SETTINGS_URL, { session_auto_end_away_minutes: value });
      setAwayMinutes(value);
      setSaveSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, ta('settingsSaveError')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mc-study-page mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/${locale}/app`} className="text-sm font-medium text-[var(--mc-text-secondary)] hover:text-[var(--mc-text-primary)]">
          ← {ta('backToDecks')}
        </Link>
        <h2 className="mt-2 text-lg font-semibold text-[var(--mc-text-primary)]">
          {ta('settingsTitle') !== 'settingsTitle' ? ta('settingsTitle') : 'Settings'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-card)] p-6 shadow-sm">
        <h3 className="text-sm font-medium text-[var(--mc-text-primary)]">
          {ta('settingsStudySession') !== 'settingsStudySession' ? ta('settingsStudySession') : 'Study session'}
        </h3>
        <p className="mt-1 text-xs text-[var(--mc-text-secondary)]">
          {ta('settingsAwayMinutesHint') !== 'settingsAwayMinutesHint'
            ? ta('settingsAwayMinutesHint')
            : 'If you leave the tab for longer than this, the session will end. Between 5 seconds and this limit, the session pauses and you can resume.'}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="away-minutes" className="text-sm text-[var(--mc-text-secondary)]">
            {ta('settingsEndSessionAfterAway') !== 'settingsEndSessionAfterAway'
              ? ta('settingsEndSessionAfterAway')
              : 'End session after away (minutes)'}
          </label>
          <input
            id="away-minutes"
            type="number"
            min={MIN_AWAY}
            max={MAX_AWAY}
            value={loading ? '' : awayMinutes}
            onChange={(e) => setAwayMinutes(Math.max(MIN_AWAY, Math.min(MAX_AWAY, parseInt(e.target.value, 10) || MIN_AWAY)))}
            disabled={loading}
            className="w-20 rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-page)] px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-[var(--mc-text-secondary)]">1–120</span>
        </div>
        {error && <p className="mt-2 text-sm text-[var(--mc-accent-danger)]" role="alert">{error}</p>}
        {saveSuccess && (
          <p className="mt-2 text-sm text-[var(--mc-accent-success)]" role="status">
            {ta('settingsSaved') !== 'settingsSaved' ? ta('settingsSaved') : 'Saved.'}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || saving}
          className="mt-4 rounded-lg bg-[var(--mc-accent-primary)] px-4 py-2 text-sm font-medium text-white opacity-90 hover:opacity-100 disabled:opacity-50"
        >
          {saving ? (tc('saving') !== 'saving' ? tc('saving') : 'Saving…') : ta('save') !== 'save' ? ta('save') : 'Save'}
        </button>
      </form>
    </div>
  );
}
