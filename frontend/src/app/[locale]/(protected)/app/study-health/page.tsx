'use client';

/**
 * Study health: aggregates GET /api/study/health-dashboard, /health-alerts, and /journey-consistency.
 * Dashboard failure is blocking; alerts and journey show inline errors if their requests fail.
 */

import Link from 'next/link';
import { useLocale } from 'i18n';
import { useApiGet } from '@/hooks/useApiGet';
import { useTranslation } from '@/hooks/useTranslation';

/** Same window as backend defaults for health-dashboard / health-alerts (max 90 days on API). */
const STUDY_HEALTH_DAYS = 30;
/** Capped sample IDs in journey-consistency report (backend max 50). */
const JOURNEY_SAMPLE_LIMIT = 20;

/** Single point for sparkline polyline (day label unused in SVG; kept for debugging). */
interface TrendPoint {
  day: string;
  value: number;
}

/** GET /api/study/health-dashboard — trends + aggregates used by charts below. */
interface StudyHealthDashboard {
  days: number;
  authRefresh: {
    total: number;
    failures: number;
    failureRate: number;
    reuseDetected: number;
    trendByDay: Array<{
      day: string;
      total: number;
      failures: number;
      reuseDetected: number;
    }>;
  };
  journeyConsistency: {
    level: 'healthy' | 'minor_issues' | 'needs_attention';
    mismatchRate: number;
    thresholds: {
      minor: number;
      major: number;
    };
    trendByDay: Array<{
      day: string;
      reviewLogs: number;
      ratingJourneyEvents: number;
      mismatchRate: number;
    }>;
  };
  studyApiLatency: {
    overall: {
      sampleCount: number;
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
    };
    byRoute: Array<{
      route: string;
      sampleCount: number;
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
    }>;
    trendByDay: Array<{
      day: string;
      sampleCount: number;
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
    }>;
  };
  reviewThroughputByDay: Array<{ day: string; reviewCount: number }>;
}

/** One rule from GET /api/study/health-alerts (`triggered` drives UI). */
interface StudyHealthAlert {
  id: string;
  severity: 'warning' | 'critical';
  triggered: boolean;
  message: string;
  value: number;
  threshold: number;
}

/** GET /api/study/health-alerts — built from the same dashboard window as thresholds. */
interface StudyHealthAlertsReport {
  days: number;
  generatedAt: string;
  triggeredCount: number;
  highestSeverity: 'warning' | 'critical' | null;
  alerts: StudyHealthAlert[];
}

/** GET /api/study/journey-consistency — review_logs vs card_journey_events (rating_submitted). */
interface JourneyConsistencyReport {
  days: number;
  health: {
    level: 'healthy' | 'minor_issues' | 'needs_attention';
    mismatchRate: number;
    thresholds: {
      minor: number;
      major: number;
    };
  };
  totals: {
    reviewLogs: number;
    ratingJourneyEvents: number;
    duplicateRatingJourneyGroups: number;
    orderingIssues: number;
  };
  mismatches: {
    missingRatingJourneyEvents: number;
    duplicateRatingJourneyEvents: number;
    orderingIssues: number;
  };
  samples: {
    missingReviewLogIds: string[];
    duplicateReviewLogIds: string[];
    orderingIssueEventIds: string[];
  };
}

/** Builds SVG polyline `points` for a tiny sparkline (fixed 220×56 viewBox). */
function miniSparklinePoints(points: TrendPoint[]): string {
  if (points.length === 0) return '';
  const width = 220;
  const height = 56;
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);
  const range = Math.max(1e-6, max - min);
  return points
    .map((p, idx) => {
      const x = (idx / Math.max(1, points.length - 1)) * width;
      const y = height - ((p.value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** One metric trend from health-dashboard `trendByDay` series. */
function TrendCard(props: { title: string; subtitle: string; points: TrendPoint[] }) {
  const { locale } = useLocale();
  const { t: ta } = useTranslation('app', locale);
  const polyline = miniSparklinePoints(props.points);
  const hasData = props.points.length > 0;
  return (
    <div className="mc-study-surface rounded-lg border p-4 shadow-sm">
      <h3 className="text-sm font-medium text-(--mc-text-primary)">{props.title}</h3>
      <p className="mt-1 text-xs text-(--mc-text-secondary)">{props.subtitle}</p>
      <div className="mt-3">
        {hasData ? (
          <svg viewBox="0 0 220 56" className="h-16 w-full">
            <polyline
              fill="none"
              stroke="var(--mc-accent-primary)"
              strokeWidth="2"
              points={polyline}
            />
          </svg>
        ) : (
          <p className="text-xs text-(--mc-text-secondary)">{ta('studyHealthChartNoData')}</p>
        )}
      </div>
    </div>
  );
}

/** Maps CardJourneyService health.level to app.json journeyConsistency* keys. */
function journeyHealthLabel(
  level: JourneyConsistencyReport['health']['level'],
  t: (key: string, options?: { vars?: Record<string, string | number> }) => string
): string {
  switch (level) {
    case 'healthy':
      return t('journeyConsistencyHealthy');
    case 'minor_issues':
      return t('journeyConsistencyMinorIssues');
    case 'needs_attention':
      return t('journeyConsistencyNeedsAttention');
    default:
      return level;
  }
}

export default function StudyHealthPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);

  const dashboardQuery = `/api/study/health-dashboard?days=${STUDY_HEALTH_DAYS}`;
  const alertsQuery = `/api/study/health-alerts?days=${STUDY_HEALTH_DAYS}`;
  const journeyQuery = `/api/study/journey-consistency?days=${STUDY_HEALTH_DAYS}&sampleLimit=${JOURNEY_SAMPLE_LIMIT}`;

  // Parallel loads; we gate the full page on all three so charts and panels stay in sync on time range.
  const { data, loading: dashLoading, error } = useApiGet<StudyHealthDashboard>(dashboardQuery, {
    errorFallback: ta('studyHealthDashboardLoadError'),
  });
  const {
    data: alertsData,
    loading: alertsLoading,
    error: alertsError,
  } = useApiGet<StudyHealthAlertsReport>(alertsQuery, {
    errorFallback: ta('studyHealthAlertsLoadError'),
  });
  const {
    data: journeyData,
    loading: journeyLoading,
    error: journeyError,
  } = useApiGet<JourneyConsistencyReport>(journeyQuery, {
    errorFallback: ta('journeyConsistencyLoadError'),
  });

  const loading = dashLoading || alertsLoading || journeyLoading;

  if (loading) {
    return <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>;
  }

  // Without dashboard payload we cannot render sparklines (same source as alerts thresholds).
  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
          {error || ta('studyHealthDashboardUnavailable')}
        </p>
        <Link
          href={`/${locale}/app`}
          className="text-sm font-medium text-(--mc-text-secondary)"
        >
          {ta('backToDecks')}
        </Link>
      </div>
    );
  }

  // API returns oldest→newest; reverse so the sparkline reads recent→past left to right.
  const refreshTrend = data.authRefresh.trendByDay
    .slice()
    .reverse()
    .map((d) => ({ day: d.day, value: d.failures }));
  const mismatchTrend = data.journeyConsistency.trendByDay
    .slice()
    .reverse()
    .map((d) => ({ day: d.day, value: d.mismatchRate * 100 }));
  const latencyTrend = data.studyApiLatency.trendByDay
    .slice()
    .reverse()
    .map((d) => ({ day: d.day, value: d.p95Ms ?? 0 }));
  const throughputTrend = data.reviewThroughputByDay
    .slice()
    .reverse()
    .map((d) => ({ day: d.day, value: d.reviewCount }));

  // health-alerts: only rows with triggered === true are user-facing.
  const triggeredAlerts = alertsData?.alerts.filter((a) => a.triggered) ?? [];
  const alertsGenerated =
    alertsData?.generatedAt &&
    new Date(alertsData.generatedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  // journey-consistency: sample arrays are capped server-side; counts shown, not full id lists.
  const sampleMissing = journeyData?.samples.missingReviewLogIds.length ?? 0;
  const sampleDup = journeyData?.samples.duplicateReviewLogIds.length ?? 0;
  const sampleOrder = journeyData?.samples.orderingIssueEventIds.length ?? 0;
  const hasSampleSummary = sampleMissing + sampleDup + sampleOrder > 0;

  return (
    <div className="mc-study-page mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-(--mc-text-primary)">{ta('studyHealthDashboardTitle')}</h2>
          <p className="mt-1 text-sm text-(--mc-text-secondary)">{ta('studyHealthDashboardIntro')}</p>
        </div>
        <Link
          href={`/${locale}/app`}
          className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
        >
          {ta('backToDecks')}
        </Link>
      </div>

      {/* Sparklines: all series from health-dashboard */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrendCard
          title={ta('studyHealthChartRefreshFailuresTitle')}
          subtitle={ta('studyHealthChartRefreshFailuresSubtitle')}
          points={refreshTrend}
        />
        <TrendCard
          title={ta('studyHealthChartMismatchRateTitle')}
          subtitle={ta('studyHealthChartMismatchRateSubtitle')}
          points={mismatchTrend}
        />
        <TrendCard
          title={ta('studyHealthChartLatencyTitle')}
          subtitle={ta('studyHealthChartLatencySubtitle')}
          points={latencyTrend}
        />
        <TrendCard
          title={ta('studyHealthChartThroughputTitle')}
          subtitle={ta('studyHealthChartThroughputSubtitle')}
          points={throughputTrend}
        />
      </div>

      {/* health-alerts + journey-consistency (inline error if either GET failed) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="mc-study-surface rounded-lg border p-4 shadow-sm"
          aria-labelledby="study-health-alerts-heading"
        >
          <h3
            id="study-health-alerts-heading"
            className="text-sm font-medium text-(--mc-text-primary)"
          >
            {ta('studyHealthAlertsTitle')}
          </h3>
          {alertsError ? (
            <p className="mt-2 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
              {alertsError}
            </p>
          ) : alertsData ? (
            <div className="mt-2 space-y-2">
              {alertsGenerated ? (
                <p className="text-xs text-(--mc-text-secondary)">
                  {ta('studyHealthAlertsGenerated', { vars: { time: alertsGenerated } })}
                </p>
              ) : null}
              {triggeredAlerts.length === 0 ? (
                <p className="text-sm text-(--mc-text-secondary)">{ta('studyHealthAlertsAllClear')}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {triggeredAlerts.map((a) => (
                    <li
                      key={a.id}
                      className="rounded border border-(--mc-border-subtle) bg-(--mc-bg-card-back) px-3 py-2"
                    >
                      <span
                        className={
                          a.severity === 'critical'
                            ? 'font-medium text-(--mc-accent-danger)'
                            : 'font-medium text-(--mc-accent-warning)'
                        }
                      >
                        {a.severity === 'critical'
                          ? ta('studyHealthAlertSeverityCritical')
                          : ta('studyHealthAlertSeverityWarning')}
                        {': '}
                      </span>
                      <span className="text-(--mc-text-primary)">{a.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>

        <section
          className="mc-study-surface rounded-lg border p-4 shadow-sm"
          aria-labelledby="study-health-journey-heading"
        >
          <h3
            id="study-health-journey-heading"
            className="text-sm font-medium text-(--mc-text-primary)"
          >
            {ta('journeyConsistencyTitle')}
          </h3>
          {journeyError ? (
            <p className="mt-2 text-sm text-(--mc-accent-danger)" role="alert" aria-live="polite">
              {journeyError}
            </p>
          ) : journeyData ? (
            <div className="mt-2 space-y-2 text-sm text-(--mc-text-primary)">
              <p>
                <span className="font-medium text-(--mc-text-secondary)">
                  {journeyHealthLabel(journeyData.health.level, ta)}
                </span>
                {' — '}
                {ta('studyHealthJourneyMismatchPct', {
                  vars: { pct: (journeyData.health.mismatchRate * 100).toFixed(2) },
                })}
              </p>
              <ul className="space-y-1 text-(--mc-text-secondary)">
                <li>{ta('journeyReviewLogs', { vars: { count: journeyData.totals.reviewLogs } })}</li>
                <li>
                  {ta('journeyRatingEvents', { vars: { count: journeyData.totals.ratingJourneyEvents } })}
                </li>
                <li>
                  {ta('journeyDuplicateLinks', {
                    vars: { count: journeyData.totals.duplicateRatingJourneyGroups },
                  })}
                </li>
                <li>
                  {ta('journeyMissing', { vars: { count: journeyData.mismatches.missingRatingJourneyEvents } })}
                </li>
                <li>
                  {ta('journeyOrderingIssues', { vars: { count: journeyData.totals.orderingIssues } })}
                </li>
              </ul>
              <p className="text-xs text-(--mc-text-secondary)">
                {hasSampleSummary
                  ? ta('studyHealthJourneySamplesSummary', {
                      vars: { missing: sampleMissing, dup: sampleDup, order: sampleOrder },
                    })
                  : ta('studyHealthJourneySamplesEmpty')}
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
