'use client';

import Link from 'next/link';
import { useLocale } from 'i18n';
import { useApiGet } from '@/hooks/useApiGet';
import { useTranslation } from '@/hooks/useTranslation';

interface TrendPoint {
  day: string;
  value: number;
}

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

function TrendCard(props: { title: string; subtitle: string; points: TrendPoint[] }) {
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
          <p className="text-xs text-(--mc-text-secondary)">No data</p>
        )}
      </div>
    </div>
  );
}

export default function StudyHealthPage() {
  const { locale } = useLocale();
  const { t: tc } = useTranslation('common', locale);
  const { t: ta } = useTranslation('app', locale);
  const { data, loading, error } = useApiGet<StudyHealthDashboard>('/api/study/health-dashboard?days=30', {
    errorFallback: ta('studyHealthDashboardLoadError'),
  });

  if (loading) {
    return <p className="text-sm text-(--mc-text-secondary)">{tc('loading')}</p>;
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-(--mc-accent-danger)" role="alert">
          {error || ta('studyHealthDashboardUnavailable')}
        </p>
        <Link
          href={`/${locale}/app/study-sessions`}
          className="text-sm font-medium text-(--mc-text-secondary) underline hover:no-underline"
        >
          {ta('viewStudySessions')}
        </Link>
      </div>
    );
  }

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

  return (
    <div className="mc-study-page mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-(--mc-text-primary)">{ta('studyHealthDashboardTitle')}</h2>
          <p className="mt-1 text-sm text-(--mc-text-secondary)">{ta('studyHealthDashboardIntro')}</p>
        </div>
        <Link
          href={`/${locale}/app/study-sessions`}
          className="rounded border border-(--mc-border-subtle) px-3 pt-1 pb-1.5 text-sm text-(--mc-text-secondary) hover:bg-(--mc-bg-card-back)"
        >
          {ta('viewStudySessions')}
        </Link>
      </div>

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
    </div>
  );
}
