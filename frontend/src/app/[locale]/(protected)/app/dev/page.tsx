'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import { useApiGet } from '@/hooks/useApiGet';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/auth.store';

interface FeatureFlagRow {
  flagKey: string;
  enabled: boolean;
  rolloutPercentage: number;
  description: string | null;
  updatedAt: string;
  overrideCount: number;
}

interface FeatureFlagOverrideRow {
  userId: string;
  enabled: boolean;
  reason: string | null;
  updatedAt: string;
}

export default function DevPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const user = useAuthStore((s) => s.user);
  const isDev = user?.role === 'dev';

  const { data, loading, error, refetch } = useApiGet<{ flags: FeatureFlagRow[] }>('/api/dev/feature-flags', {
    errorFallback: ta('devLoadError'),
    enabled: isDev,
  });
  const flags = data?.flags ?? [];
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingFlagKey, setSavingFlagKey] = useState<string | null>(null);
  const [selectedFlagKey, setSelectedFlagKey] = useState<string>('');
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideRows, setOverrideRows] = useState<FeatureFlagOverrideRow[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(false);

  async function updateFlag(flag: FeatureFlagRow, patch: Partial<Pick<FeatureFlagRow, 'enabled' | 'rolloutPercentage'>>) {
    setSavingFlagKey(flag.flagKey);
    setMessage(null);
    try {
      await apiClient.patch(`/api/dev/feature-flags/${flag.flagKey}`, {
        enabled: patch.enabled ?? flag.enabled,
        rolloutPercentage: patch.rolloutPercentage ?? flag.rolloutPercentage,
        description: flag.description,
      });
      setMessage({ type: 'success', text: ta('adminSaved') });
      refetch();
    } catch (err) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, ta('adminSaveError')) });
    } finally {
      setSavingFlagKey(null);
    }
  }

  async function loadOverrides(flagKey: string) {
    setSelectedFlagKey(flagKey);
    setLoadingOverrides(true);
    try {
      const res = await apiClient.get<{ success: boolean; data?: { rows?: FeatureFlagOverrideRow[] } }>(
        `/api/dev/feature-flags/${flagKey}/overrides?limit=50`
      );
      setOverrideRows(res.data?.data?.rows ?? []);
    } catch {
      setOverrideRows([]);
    } finally {
      setLoadingOverrides(false);
    }
  }

  async function upsertOverride() {
    if (!selectedFlagKey || !overrideUserId.trim()) return;
    setMessage(null);
    try {
      await apiClient.put(`/api/dev/feature-flags/${selectedFlagKey}/overrides/${overrideUserId.trim()}`, {
        enabled: overrideEnabled,
        reason: overrideReason.trim() || null,
      });
      setMessage({ type: 'success', text: ta('adminOverrideSaved') });
      await loadOverrides(selectedFlagKey);
      refetch();
    } catch (err) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, ta('adminSaveError')) });
    }
  }

  async function removeOverride(userId: string) {
    if (!selectedFlagKey) return;
    setMessage(null);
    try {
      await apiClient.delete(`/api/dev/feature-flags/${selectedFlagKey}/overrides/${userId}`);
      setMessage({ type: 'success', text: ta('adminOverrideRemoved') });
      await loadOverrides(selectedFlagKey);
      refetch();
    } catch (err) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, ta('adminSaveError')) });
    }
  }

  if (user != null && !isDev) {
    return (
      <div className="mc-study-page mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--mc-text-primary)]">{ta('devAccessDeniedTitle')}</h2>
          <p className="mt-2 text-sm text-[var(--mc-text-secondary)]">{ta('devAccessDeniedMessage')}</p>
          <Link
            href={`/${locale}/app`}
            className="mt-4 inline-block rounded bg-[var(--mc-accent-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {ta('devBackToApp')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-study-page mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--mc-text-primary)]">{ta('devTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--mc-text-secondary)]">{ta('devIntro')}</p>
        <p className="mt-2 text-xs text-[var(--mc-text-secondary)]" role="note">
          {ta('devOnlyNotice')}
        </p>
      </div>

      <section
        className="rounded-xl border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-card-back)] p-4"
        aria-labelledby="dev-explanations-heading"
      >
        <h3 id="dev-explanations-heading" className="text-sm font-semibold text-[var(--mc-text-primary)]">
          {ta('devExplanationsTitle')}
        </h3>
        <ul className="mt-3 space-y-2 text-xs text-[var(--mc-text-secondary)] [list-style:revert] pl-4">
          <li>{ta('devExplanationEnabled')}</li>
          <li>{ta('devExplanationRollout')}</li>
          <li>{ta('devExplanationOverrides')}</li>
          <li>{ta('devExplanationAudit')}</li>
        </ul>
      </section>

      {message && (
        <p className={message.type === 'error' ? 'text-sm text-[var(--mc-accent-danger)]' : 'text-sm text-[var(--mc-accent-success)]'}>
          {message.text}
        </p>
      )}
      {error && <p className="text-sm text-[var(--mc-accent-danger)]">{error}</p>}
      {loading ? (
        <p className="text-sm text-[var(--mc-text-secondary)]">{tc('loading')}</p>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div key={flag.flagKey} className="mc-study-surface rounded-xl border p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--mc-text-primary)]">{flag.flagKey}</p>
                  <p className="text-xs text-[var(--mc-text-secondary)]">
                    {ta('adminFlagMeta', { vars: { count: String(flag.overrideCount), at: new Date(flag.updatedAt).toLocaleString(locale) } })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadOverrides(flag.flagKey)}
                  className="rounded border border-[var(--mc-border-subtle)] px-2 py-1 text-xs text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                >
                  {ta('adminManageOverrides')}
                </button>
              </div>
              {flag.description && <p className="mt-2 text-sm text-[var(--mc-text-secondary)]">{flag.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-[var(--mc-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={flag.enabled}
                    onChange={(e) => void updateFlag(flag, { enabled: e.target.checked })}
                    disabled={savingFlagKey === flag.flagKey}
                  />
                  {ta('adminEnabled')}
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-[var(--mc-text-secondary)]">
                  {ta('adminRollout')}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={flag.rolloutPercentage}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next)) {
                        void updateFlag(flag, { rolloutPercentage: Math.max(0, Math.min(100, Math.round(next))) });
                      }
                    }}
                    disabled={savingFlagKey === flag.flagKey}
                    className="w-20 rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-2 py-1 text-sm text-[var(--mc-text-primary)]"
                  />
                  %
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedFlagKey && (
        <div className="mc-study-surface rounded-xl border p-4 shadow-sm">
          <h3 className="font-medium text-[var(--mc-text-primary)]">{ta('adminOverridesTitle', { vars: { flag: selectedFlagKey } })}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder={ta('adminUserIdPlaceholder')}
              value={overrideUserId}
              onChange={(e) => setOverrideUserId(e.target.value)}
              className="w-72 rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-2 py-1 text-sm text-[var(--mc-text-primary)]"
            />
            <select
              value={overrideEnabled ? 'enabled' : 'disabled'}
              onChange={(e) => setOverrideEnabled(e.target.value === 'enabled')}
              className="rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-2 py-1 text-sm text-[var(--mc-text-primary)]"
            >
              <option value="enabled">{ta('adminOverrideEnabled')}</option>
              <option value="disabled">{ta('adminOverrideDisabled')}</option>
            </select>
            <input
              type="text"
              placeholder={ta('adminReasonPlaceholder')}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-60 rounded border border-[var(--mc-border-subtle)] bg-[var(--mc-bg-surface)] px-2 py-1 text-sm text-[var(--mc-text-primary)]"
            />
            <button
              type="button"
              onClick={() => void upsertOverride()}
              className="rounded bg-[var(--mc-accent-success)] px-3 py-1 text-sm text-white"
            >
              {ta('adminSaveOverride')}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {loadingOverrides ? (
              <p className="text-sm text-[var(--mc-text-secondary)]">{tc('loading')}</p>
            ) : overrideRows.length === 0 ? (
              <p className="text-sm text-[var(--mc-text-secondary)]">{ta('adminNoOverrides')}</p>
            ) : (
              overrideRows.map((row) => (
                <div key={row.userId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--mc-border-subtle)] px-3 py-2">
                  <div className="text-sm">
                    <p className="text-[var(--mc-text-primary)]">{row.userId}</p>
                    <p className="text-xs text-[var(--mc-text-secondary)]">
                      {row.enabled ? ta('adminOverrideEnabled') : ta('adminOverrideDisabled')} · {new Date(row.updatedAt).toLocaleString(locale)}
                    </p>
                    {row.reason && <p className="text-xs text-[var(--mc-text-secondary)]">{row.reason}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeOverride(row.userId)}
                    className="rounded border border-[var(--mc-border-subtle)] px-2 py-1 text-xs text-[var(--mc-text-secondary)] hover:bg-[var(--mc-bg-card-back)]"
                  >
                    {ta('adminRemoveOverride')}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
