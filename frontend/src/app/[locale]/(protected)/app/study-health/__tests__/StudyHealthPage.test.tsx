import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import StudyHealthPage from '../page';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('i18n')>();
  return { ...actual, useLocale: () => ({ locale: 'en' }) };
});

vi.mock('@/hooks/useApiGet', () => ({
  useApiGet: mockApiGet,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { vars?: Record<string, string | number> }) => {
      const map: Record<string, string> = {
        loading: 'Loading…',
        backToDecks: 'Back to decks',
        studyHealthDashboardTitle: 'Review stats & system health',
        studyHealthDashboardIntro: 'Overview of your review activity, journey consistency, and service status.',
        studyHealthDashboardLoadError: 'Failed to load health dashboard.',
        studyHealthDashboardUnavailable: 'Health dashboard unavailable.',
        studyHealthChartRefreshFailuresTitle: 'Refresh failures',
        studyHealthChartRefreshFailuresSubtitle: 'Daily failures in refresh flow',
        studyHealthChartMismatchRateTitle: 'Journey mismatch rate',
        studyHealthChartMismatchRateSubtitle: 'Daily mismatch rate (%)',
        studyHealthChartLatencyTitle: 'Study API latency (p95)',
        studyHealthChartLatencySubtitle: 'Daily p95 in milliseconds',
        studyHealthChartThroughputTitle: 'Review throughput',
        studyHealthChartThroughputSubtitle: 'Reviews per day',
        studyHealthAlertsTitle: 'Threshold alerts',
        studyHealthAlertsLoadError: 'Failed to load alerts.',
        studyHealthAlertsAllClear: 'No threshold alerts in this window.',
        studyHealthAlertsGenerated: `As of ${options?.vars?.time ?? ''}`,
        studyHealthAlertSeverityWarning: 'Warning',
        studyHealthAlertSeverityCritical: 'Critical',
        journeyConsistencyTitle: 'Journey consistency',
        journeyConsistencyHealthy: 'Healthy',
        journeyConsistencyMinorIssues: 'Minor issues',
        journeyConsistencyNeedsAttention: 'Needs attention',
        journeyConsistencyLoadError: 'Failed to load consistency report.',
        studyHealthJourneyMismatchPct: `${options?.vars?.pct ?? ''}% mismatch rate`,
        journeyReviewLogs: `Review logs: ${options?.vars?.count ?? 0}`,
        journeyRatingEvents: `Journey ratings: ${options?.vars?.count ?? 0}`,
        journeyDuplicateLinks: `Duplicate journey links: ${options?.vars?.count ?? 0}`,
        journeyMissing: `Missing links: ${options?.vars?.count ?? 0}`,
        journeyOrderingIssues: `Ordering issues: ${options?.vars?.count ?? 0}`,
        studyHealthJourneySamplesSummary: `Sample IDs: ${options?.vars?.missing ?? 0} missing · ${options?.vars?.dup ?? 0} duplicate · ${options?.vars?.order ?? 0} ordering`,
        studyHealthJourneySamplesEmpty: 'No sample IDs in this window (or none within the cap).',
      };
      return map[key] ?? key;
    },
  }),
}));

const dashboardPayload = {
  days: 30,
  authRefresh: {
    total: 10,
    failures: 2,
    failureRate: 0.2,
    reuseDetected: 1,
    trendByDay: [{ day: '2026-02-17', total: 3, failures: 1, reuseDetected: 0 }],
  },
  journeyConsistency: {
    level: 'healthy' as const,
    mismatchRate: 0.01,
    thresholds: { minor: 0.01, major: 0.05 },
    trendByDay: [{ day: '2026-02-17', reviewLogs: 10, ratingJourneyEvents: 10, mismatchRate: 0 }],
  },
  studyApiLatency: {
    overall: { sampleCount: 40, p50Ms: 120, p95Ms: 340, p99Ms: 650 },
    byRoute: [],
    trendByDay: [{ day: '2026-02-17', sampleCount: 20, p50Ms: 100, p95Ms: 300, p99Ms: 500 }],
  },
  reviewThroughputByDay: [{ day: '2026-02-17', reviewCount: 14 }],
};

const alertsPayload = {
  days: 30,
  generatedAt: '2026-02-17T12:00:00.000Z',
  triggeredCount: 0,
  highestSeverity: null,
  alerts: [
    {
      id: 'journey_mismatch_rate',
      severity: 'critical' as const,
      triggered: false,
      message: 'Journey mismatch rate above major threshold',
      value: 0.01,
      threshold: 0.05,
    },
  ],
};

const journeyPayload = {
  days: 30,
  health: {
    level: 'healthy' as const,
    mismatchRate: 0,
    thresholds: { minor: 0.01, major: 0.05 },
  },
  totals: {
    reviewLogs: 10,
    ratingJourneyEvents: 10,
    duplicateRatingJourneyGroups: 0,
    orderingIssues: 0,
  },
  mismatches: {
    missingRatingJourneyEvents: 0,
    duplicateRatingJourneyEvents: 0,
    orderingIssues: 0,
  },
  samples: {
    missingReviewLogIds: [] as string[],
    duplicateReviewLogIds: [] as string[],
    orderingIssueEventIds: [] as string[],
  },
};

describe('StudyHealthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith('/api/study/health-dashboard')) {
        return { data: dashboardPayload, loading: false, error: '', refetch: vi.fn() };
      }
      if (url.startsWith('/api/study/health-alerts')) {
        return { data: alertsPayload, loading: false, error: '', refetch: vi.fn() };
      }
      if (url.startsWith('/api/study/journey-consistency')) {
        return { data: journeyPayload, loading: false, error: '', refetch: vi.fn() };
      }
      return { data: null, loading: false, error: 'unknown url', refetch: vi.fn() };
    });
  });

  it('renders dashboard title, trend cards, alerts and journey sections', () => {
    render(<StudyHealthPage />);
    expect(screen.getByRole('heading', { name: 'Review stats & system health' })).toBeInTheDocument();
    expect(screen.getByText('Refresh failures')).toBeInTheDocument();
    expect(screen.getByText('Journey mismatch rate')).toBeInTheDocument();
    expect(screen.getByText('Study API latency (p95)')).toBeInTheDocument();
    expect(screen.getByText('Review throughput')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Threshold alerts' })).toBeInTheDocument();
    expect(screen.getByText('No threshold alerts in this window.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Journey consistency' })).toBeInTheDocument();
    expect(screen.getByText(/Review logs: 10/)).toBeInTheDocument();
  });
});
