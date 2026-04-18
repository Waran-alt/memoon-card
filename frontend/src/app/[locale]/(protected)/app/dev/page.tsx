'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ChevronRight, ExternalLink, FileText, Flag } from 'lucide-react';
import { useLocale } from 'i18n';
import apiClient, { getApiErrorMessage } from '@/lib/api';
import {
  getDevPanelExternalTools,
  getGrafanaExploreUrl,
  getLokiBaseUrl,
  type DevPanelExternalToolId,
} from '@/lib/devPanelLinks';
import { useApiGet } from '@/hooks/useApiGet';
import { useTranslation } from '@/hooks/useTranslation';
import { McSelect } from '@/components/ui/McSelect';
import { useAuthStore } from '@/store/auth.store';
import { Button, buttonClassName } from '@/components/ui/Button';

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

const cardClass =
  'rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-5 shadow-sm';
const sectionTitleClass = 'text-base font-semibold tracking-tight text-(--mc-text-primary)';
const innerLinkClass = 'font-medium text-(--mc-accent-primary) underline-offset-2 hover:underline';
const externalLinkClass = `${innerLinkClass} inline-flex items-center gap-1.5`;

function toolLabel(ta: (k: string) => string, id: DevPanelExternalToolId): string {
  switch (id) {
    case 'grafana':
      return ta('devToolGrafana');
    case 'prometheus':
      return ta('devToolPrometheus');
    case 'loki':
      return ta('devToolLoki');
    case 'cadvisor':
      return ta('devToolCadvisor');
    default:
      return id;
  }
}

function toolDesc(ta: (k: string) => string, id: DevPanelExternalToolId): string {
  switch (id) {
    case 'grafana':
      return ta('devToolGrafanaDesc');
    case 'prometheus':
      return ta('devToolPrometheusDesc');
    case 'loki':
      return ta('devToolLokiDesc');
    case 'cadvisor':
      return ta('devToolCadvisorDesc');
    default:
      return '';
  }
}

export default function DevPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const user = useAuthStore((s) => s.user);
  const isDev = user?.role === 'dev';

  const externalTools = useMemo(() => getDevPanelExternalTools(), []);
  const grafanaExploreUrl = useMemo(() => getGrafanaExploreUrl(), []);
  const lokiBaseUrl = useMemo(() => getLokiBaseUrl(), []);

  const { data, loading, error, refetch } = useApiGet<{ flags: FeatureFlagRow[] }>('/api/dev/feature-flags', {
    errorFallback: ta('devLoadError'),
    enabled: isDev,
  });
  const flags = data?.flags ?? [];
  const overrideEnabledOptions = useMemo(
    () => [
      { value: 'enabled', label: ta('adminOverrideEnabled') },
      { value: 'disabled', label: ta('adminOverrideDisabled') },
    ],
    [ta]
  );
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
        <div className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-(--mc-text-primary)">{ta('devAccessDeniedTitle')}</h2>
          <p className="mt-2 text-sm text-(--mc-text-secondary)">{ta('devAccessDeniedMessage')}</p>
          <Link href={`/${locale}/app`} className={buttonClassName({ variant: 'primary', className: 'mt-4 inline-flex' })}>
            {ta('devBackToApp')}
          </Link>
        </div>
      </div>
    );
  }

  const appBase = `/${locale}/app`;

  return (
    <div className="mc-study-page mx-auto max-w-6xl space-y-10 pb-12">
      <header className="border-b border-(--mc-border-subtle) pb-6">
        <h1 className="text-2xl font-semibold text-(--mc-text-primary)">{ta('devTitle')}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-(--mc-text-secondary)">{ta('devIntro')}</p>
        <p className="mt-3 text-xs text-(--mc-text-muted)" role="note">
          {ta('devOnlyNotice')}
        </p>
      </header>

      {/* Dashboards: in-app + external observability */}
      <section aria-labelledby="dev-dashboards-heading">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 shrink-0 text-(--mc-accent-primary)" aria-hidden />
          <h2 id="dev-dashboards-heading" className={sectionTitleClass}>
            {ta('devSectionDashboards')}
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={cardClass}>
            <h3 className="text-sm font-semibold text-(--mc-text-primary)">{ta('devSectionInApp')}</h3>
            <ul className="mt-4 space-y-4 text-sm">
              <li>
                <Link href={`${appBase}/stats`} className={innerLinkClass}>
                  {ta('devQuickLinkStats')}
                </Link>
                <p className="mt-1 text-xs leading-snug text-(--mc-text-secondary)">{ta('devQuickLinkStatsHint')}</p>
              </li>
              <li>
                <Link href={`${appBase}/study-health`} className={innerLinkClass}>
                  {ta('devQuickLinkHealth')}
                </Link>
                <p className="mt-1 text-xs leading-snug text-(--mc-text-secondary)">{ta('devQuickLinkHealthHint')}</p>
              </li>
              <li>
                <Link href={`${appBase}/optimizer`} className={innerLinkClass}>
                  {ta('devQuickLinkOptimizer')}
                </Link>
                <p className="mt-1 text-xs leading-snug text-(--mc-text-secondary)">{ta('devQuickLinkOptimizerHint')}</p>
              </li>
            </ul>
          </div>

          <div className={cardClass}>
            <h3 className="text-sm font-semibold text-(--mc-text-primary)">{ta('devSectionObservability')}</h3>
            {externalTools.length === 0 ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs leading-relaxed text-(--mc-text-secondary)">{ta('devToolsObservabilityEmpty')}</p>
                <p className="text-xs leading-relaxed text-(--mc-text-muted)">{ta('devToolsObservabilityTunnelHint')}</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-4 text-sm">
                {externalTools.map((tool) => (
                  <li key={tool.id}>
                    <a
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkClass}
                    >
                      {toolLabel(ta, tool.id)}
                      <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    </a>
                    <p className="mt-1 text-xs leading-snug text-(--mc-text-secondary)">{toolDesc(ta, tool.id)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={cardClass}>
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-(--mc-text-muted)" aria-hidden />
              <div>
                <h3 className="text-sm font-semibold text-(--mc-text-primary)">{ta('devLogsCardTitle')}</h3>
                <p className="mt-2 text-xs leading-relaxed text-(--mc-text-secondary)">{ta('devLogsCardIntro')}</p>
                {grafanaExploreUrl ? (
                  <div className="mt-4 space-y-2">
                    <a
                      href={grafanaExploreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkClass}
                    >
                      {ta('devLogsOpenExplore')}
                      <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    </a>
                    <p className="text-xs leading-relaxed text-(--mc-text-muted)">{ta('devLogsExploreHint')}</p>
                  </div>
                ) : lokiBaseUrl ? (
                  <div className="mt-4 space-y-2">
                    <a
                      href={lokiBaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkClass}
                    >
                      {ta('devLogsOpenLoki')}
                      <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    </a>
                    <p className="text-xs leading-relaxed text-(--mc-text-muted)">{ta('devLogsLokiOnlyHint')}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-(--mc-text-muted)">{ta('devLogsNoGrafana')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature flags */}
      <section aria-labelledby="dev-flags-heading">
        <div className="mb-4 flex items-center gap-2">
          <Flag className="h-5 w-5 shrink-0 text-(--mc-accent-primary)" aria-hidden />
          <h2 id="dev-flags-heading" className={sectionTitleClass}>
            {ta('devSectionFeatureFlags')}
          </h2>
        </div>

        {message && (
          <p
            className={`mb-4 text-sm ${message.type === 'error' ? 'text-(--mc-accent-danger)' : 'text-(--mc-accent-success)'}`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        )}
        {error && (
          <p className="mb-4 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>
        ) : flags.length === 0 ? (
          <p className="text-sm text-(--mc-text-secondary)">{ta('devNoFlags')}</p>
        ) : (
          <div className="space-y-4">
            {flags.map((flag) => (
              <div
                key={flag.flagKey}
                className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card-back) p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-medium text-(--mc-text-primary)">{flag.flagKey}</p>
                    <p className="text-xs text-(--mc-text-secondary)">
                      {ta('adminFlagMeta', { vars: { count: String(flag.overrideCount), at: new Date(flag.updatedAt).toLocaleString(locale) } })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadOverrides(flag.flagKey)}
                    className="rounded-lg border border-(--mc-border-subtle) px-3 py-1.5 text-xs font-medium text-(--mc-text-secondary) transition-colors hover:bg-(--mc-bg-card) hover:text-(--mc-text-primary)"
                  >
                    {ta('adminManageOverrides')}
                  </button>
                </div>
                {flag.description && <p className="mt-3 text-sm text-(--mc-text-secondary)">{flag.description}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-(--mc-text-secondary)">
                    <input
                      type="checkbox"
                      checked={flag.enabled}
                      onChange={(e) => void updateFlag(flag, { enabled: e.target.checked })}
                      disabled={savingFlagKey === flag.flagKey}
                      aria-label={`${flag.flagKey} ${ta('adminEnabled')}`}
                      className="h-4 w-4 rounded border-(--mc-border-subtle)"
                    />
                    {ta('adminEnabled')}
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-(--mc-text-secondary)">
                    {ta('adminRollout')}
                    <input
                      key={`${flag.flagKey}-${flag.updatedAt}`}
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
                      className="w-20 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-2 py-1.5 text-sm text-(--mc-text-primary)"
                      aria-label={`${flag.flagKey} ${ta('adminRollout')}`}
                    />
                    %
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedFlagKey && (
          <div className="mt-6 rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card) p-5 shadow-sm">
            <h3 className="font-medium text-(--mc-text-primary)">{ta('adminOverridesTitle', { vars: { flag: selectedFlagKey } })}</h3>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder={ta('adminUserIdPlaceholder')}
                value={overrideUserId}
                onChange={(e) => setOverrideUserId(e.target.value)}
                className="min-w-48 flex-1 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm text-(--mc-text-primary) md:max-w-md"
                aria-label={ta('adminUserIdPlaceholder')}
              />
              <McSelect
                id="dev-override-enabled"
                value={overrideEnabled ? 'enabled' : 'disabled'}
                onChange={(v) => setOverrideEnabled(v === 'enabled')}
                options={overrideEnabledOptions}
                className="w-auto min-w-28"
                ariaLabel={`${ta('adminOverrideEnabled')} / ${ta('adminOverrideDisabled')}`}
              />
              <input
                type="text"
                placeholder={ta('adminReasonPlaceholder')}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="min-w-40 flex-1 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-2 text-sm text-(--mc-text-primary) md:max-w-xs"
              />
              <Button type="button" onClick={() => void upsertOverride()}>
                {ta('adminSaveOverride')}
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {loadingOverrides ? (
                <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>
              ) : overrideRows.length === 0 ? (
                <p className="text-sm text-(--mc-text-secondary)">{ta('adminNoOverrides')}</p>
              ) : (
                overrideRows.map((row) => (
                  <div
                    key={row.userId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-4 py-3"
                  >
                    <div className="text-sm">
                      <p className="font-mono text-xs text-(--mc-text-primary)">{row.userId}</p>
                      <p className="text-xs text-(--mc-text-secondary)">
                        {row.enabled ? ta('adminOverrideEnabled') : ta('adminOverrideDisabled')} · {new Date(row.updatedAt).toLocaleString(locale)}
                      </p>
                      {row.reason && <p className="mt-1 text-xs text-(--mc-text-secondary)">{row.reason}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeOverride(row.userId)}
                      className="rounded-lg border border-(--mc-border-subtle) px-3 py-1.5 text-xs text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
                    >
                      {ta('adminRemoveOverride')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      <details className="group rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-card-back) p-5">
        <summary className="cursor-pointer list-none font-medium text-(--mc-text-primary) [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <ChevronRight className="h-4 w-4 shrink-0 text-(--mc-text-muted) transition-transform group-open:rotate-90" aria-hidden />
            {ta('devExplanationsTitle')}
          </span>
        </summary>
        <ul className="mt-4 space-y-2 pl-5 text-xs leading-relaxed text-(--mc-text-secondary) [list-style:revert]">
          <li>{ta('devExplanationEnabled')}</li>
          <li>{ta('devExplanationRollout')}</li>
          <li>{ta('devExplanationOverrides')}</li>
          <li>{ta('devExplanationAudit')}</li>
        </ul>
      </details>
    </div>
  );
}
