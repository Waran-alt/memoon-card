'use client';

import { useState } from 'react';
import { useLocale } from 'i18n';
import { useApiGet } from '@/hooks/useApiGet';
import { useTranslation } from '@/hooks/useTranslation';
import type { Deck } from '@/types';

interface MetricsSummary {
  days: number;
  current: {
    reviewCount: number;
    passCount: number;
    failCount: number;
    observedRecallRate: number | null;
    avgPredictedRecall: number | null;
    avgBrierScore: number | null;
    reliability: string;
  };
  previous: { reviewCount: number; passCount: number; failCount: number };
  deltas: { reviewCount: number; observedRecallRate: number | null };
}

interface DailyRow {
  metricDate: string;
  reviewCount: number;
  passCount: number;
  failCount: number;
}

interface LearningVsGraduated {
  learningReviewCount: number;
  graduatedReviewCount: number;
}

interface StudyStatsData {
  days: number;
  summary: MetricsSummary;
  daily: DailyRow[];
  learningVsGraduated: LearningVsGraduated;
  categoryId?: string;
  categoryName?: string;
}

const DAYS_OPTIONS = [7, 30, 90] as const;

interface CategoryOption {
  id: string;
  name: string;
}

export default function StatsPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const [days, setDays] = useState(30);
  const [categoryId, setCategoryId] = useState<string>('');

  const statsUrl = `/api/study/stats?days=${days}${categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : ''}`;
  const { data, loading, error } = useApiGet<StudyStatsData>(
    statsUrl,
    { errorFallback: tc('invalidResponse') }
  );

  const { data: categoriesData } = useApiGet<{ success: boolean; data?: CategoryOption[] }>(
    '/api/users/me/categories',
    { errorFallback: '' }
  );
  const categories = categoriesData?.data ?? [];

  const { data: userSettings } = useApiGet<{
    session_auto_end_away_minutes?: number;
    learning_min_interval_minutes?: number;
    knowledge_enabled?: boolean;
    fsrs_weights?: number[];
    fsrs_weights_default?: number[];
    fsrs_weights_delta?: number[];
    target_retention?: number;
    target_retention_default?: number;
    learning_short_fsrs_params?: Record<string, unknown> | null;
  }>('/api/user/settings', { errorFallback: '' });

  const { data: decksData } = useApiGet<Deck[]>('/api/decks', { errorFallback: '' });
  const deckCount = Array.isArray(decksData) ? decksData.length : 0;

  const passRate =
    data?.summary?.current?.reviewCount != null && data.summary.current.reviewCount > 0 && data.summary.current.observedRecallRate != null
      ? Math.round(data.summary.current.observedRecallRate * 100)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-(--mc-text-secondary)">
          {data?.categoryName
            ? `${ta('statsIntro', { vars: { days: String(days) } })} · ${data.categoryName}`
            : ta('statsIntro', { vars: { days: String(days) } })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="stats-category" className="text-sm text-(--mc-text-secondary)">
                {ta('statsFilterByCategory')}
              </label>
              <select
                id="stats-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="rounded-md border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-1.5 text-sm text-(--mc-text-primary) focus:outline-none focus:ring-2 focus:ring-(--mc-accent-success)"
                aria-label={ta('statsFilterByCategory')}
              >
                <option value="">{ta('statsAllCategories')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="stats-days" className="text-sm text-(--mc-text-secondary)">
              {ta('statsLastDays', { vars: { days: String(days) } })}
            </label>
            <select
              id="stats-days"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-md border border-(--mc-border-subtle) bg-(--mc-bg-surface) px-3 py-1.5 text-sm text-(--mc-text-primary) focus:outline-none focus:ring-2 focus:ring-(--mc-accent-success)"
              aria-label={ta('statsLastDays', { vars: { days: String(days) } })}
            >
              {DAYS_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>}
      {error && (
        <div className="rounded-md border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4 text-sm text-(--mc-text-secondary)">
          {ta('statsLoadError')}
        </div>
      )}

      <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4">
        <h2 className="text-sm font-semibold text-(--mc-text-primary)">
          {ta('statsUserSection')}
        </h2>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div title={ta('statsAwayMinutesTooltip')}>
            <dt className="text-(--mc-text-muted)">{ta('statsAwayMinutes')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.session_auto_end_away_minutes ?? '—'}
            </dd>
          </div>
          <div title={ta('statsLearningMinIntervalTooltip')}>
            <dt className="text-(--mc-text-muted)">{ta('statsLearningMinInterval')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.learning_min_interval_minutes ?? '—'}
            </dd>
          </div>
          <div title={ta('statsKnowledgeEnabledTooltip')}>
            <dt className="text-(--mc-text-muted)">{ta('statsKnowledgeEnabled')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.knowledge_enabled === true ? ta('statsYes') : ta('statsNo')}
            </dd>
          </div>
          <div title={ta('statsDeckCountTooltip')}>
            <dt className="text-(--mc-text-muted)">{ta('statsDeckCount')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {deckCount}
            </dd>
          </div>
          <div title={ta('statsFsrsWeightsTooltip')}>
            <dt className="text-(--mc-text-muted)">{ta('statsFsrsWeights')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.fsrs_weights?.length === 21 ? '21' : '—'}
            </dd>
          </div>
          <div
            title={
              userSettings?.fsrs_weights_default?.length
                ? userSettings.fsrs_weights_default.map((w) => w.toFixed(4)).join(', ')
                : undefined
            }
          >
            <dt className="text-(--mc-text-muted)">{ta('statsFsrsWeightsDefault')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.fsrs_weights_default?.length === 21
                ? `21 (${userSettings.fsrs_weights_default.slice(0, 3).map((w) => w.toFixed(2)).join(', ')}…)`
                : '—'}
            </dd>
          </div>
          <div
            title={
              userSettings?.fsrs_weights_delta?.length
                ? userSettings.fsrs_weights_delta
                    .map((d, i) => `w${i}: ${d >= 0 ? '+' : ''}${d.toFixed(4)}`)
                    .join('\n')
                : undefined
            }
          >
            <dt className="text-(--mc-text-muted)">{ta('statsFsrsWeightsDelta')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.fsrs_weights_delta?.length === 21 ? (
                (() => {
                  const maxAbs = Math.max(
                    ...userSettings.fsrs_weights_delta.map((d) => Math.abs(d))
                  );
                  return maxAbs === 0 ? ta('statsFsrsWeightsDeltaNone') : `max |Δ| = ${maxAbs.toFixed(4)}`;
                })()
              ) : (
                ta('statsFsrsWeightsDeltaNone')
              )}
            </dd>
          </div>
          <div title={ta('statsTargetRetentionTooltip')}>
            <dt className="text-(--mc-text-muted)">{ta('statsTargetRetention')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.target_retention != null ? String(userSettings.target_retention) : '—'}
            </dd>
          </div>
          <div title={ta('statsTargetRetentionDefaultTooltip')}>
            <dt className="text-(--mc-text-muted)">{ta('statsTargetRetentionDefault')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.target_retention_default != null
                ? String(userSettings.target_retention_default)
                : '—'}
            </dd>
          </div>
          {userSettings?.target_retention != null &&
          userSettings?.target_retention_default != null &&
          userSettings.target_retention !== userSettings.target_retention_default ? (
            <div title={ta('statsTargetRetentionDeltaTooltip')}>
              <dt className="text-(--mc-text-muted)">{ta('statsTargetRetentionDelta')}</dt>
              <dd className="font-medium text-(--mc-text-primary)">
                {(userSettings.target_retention - userSettings.target_retention_default >= 0 ? '+' : '') +
                  (userSettings.target_retention - userSettings.target_retention_default).toFixed(3)}
              </dd>
            </div>
          ) : null}
          <div title={ta('statsShortFsrsParamsTooltip')}>
            <dt className="text-(--mc-text-muted)">{ta('statsShortFsrsParams')}</dt>
            <dd className="font-medium text-(--mc-text-primary)">
              {userSettings?.learning_short_fsrs_params != null &&
              typeof userSettings.learning_short_fsrs_params === 'object' &&
              Object.keys(userSettings.learning_short_fsrs_params).length > 0
                ? ta('statsFsrsCustom')
                : ta('statsFsrsDefault')}
            </dd>
          </div>
        </dl>
      </div>

      {data && !loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4" title={ta('statsReviewsTooltip')}>
              <p className="text-xs font-medium uppercase tracking-wide text-(--mc-text-secondary)">
                {ta('statsReviews')}
              </p>
              <p className="mt-1 text-2xl font-semibold text-(--mc-text-primary)">
                {data.summary.current.reviewCount}
              </p>
            </div>
            <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4" title={ta('statsPassRateTooltip')}>
              <p className="text-xs font-medium uppercase tracking-wide text-(--mc-text-secondary)">
                {ta('statsPassRate')}
              </p>
              <p className="mt-1 text-2xl font-semibold text-(--mc-text-primary)">
                {passRate != null ? `${passRate}%` : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4" title={ta('statsLearningReviewsTooltip')}>
              <p className="text-xs font-medium uppercase tracking-wide text-(--mc-text-secondary)">
                {ta('statsLearningReviews')}
              </p>
              <p className="mt-1 text-2xl font-semibold text-(--mc-text-primary)">
                {data.learningVsGraduated.learningReviewCount}
              </p>
            </div>
            <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4" title={ta('statsGraduatedReviewsTooltip')}>
              <p className="text-xs font-medium uppercase tracking-wide text-(--mc-text-secondary)">
                {ta('statsGraduatedReviews')}
              </p>
              <p className="mt-1 text-2xl font-semibold text-(--mc-text-primary)">
                {data.learningVsGraduated.graduatedReviewCount}
              </p>
            </div>
          </div>

          {data.daily && data.daily.length > 0 && (
            <div className="rounded-lg border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-4">
              <h2 className="text-sm font-semibold text-(--mc-text-primary)">
                {ta('statsDailyChartTitle')}
              </h2>
              <div className="mt-4 flex items-end gap-0.5 overflow-x-auto pb-2" style={{ minHeight: 120 }}>
                {[...data.daily].reverse().map((row) => {
                  const max = Math.max(1, ...data.daily.map((d) => d.reviewCount));
                  const h = max > 0 ? (row.reviewCount / max) * 80 : 0;
                  const label = new Date(row.metricDate).toLocaleDateString(locale, {
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <div
                      key={row.metricDate}
                      className="flex flex-1 flex-col items-center gap-1"
                      title={`${label}: ${row.reviewCount}`}
                    >
                      <div
                        className="w-full min-w-[8px] max-w-[24px] rounded-t bg-(--mc-accent-success)/80 transition-all"
                        style={{ height: `${h}px` }}
                      />
                      <span className="text-[10px] text-(--mc-text-secondary)">
                        {row.reviewCount}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-(--mc-text-secondary)">
                {data.daily.length} days · oldest on left
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
