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
    t: (key: string) => {
      const map: Record<string, string> = {
        loading: 'Loading…',
        viewStudySessions: 'View study sessions',
        studyHealthDashboardTitle: 'Review stats & system health',
        studyHealthDashboardIntro: 'Overview of your review activity, session consistency, and service status.',
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
      };
      return map[key] ?? key;
    },
  }),
}));

describe('StudyHealthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockReturnValue({
      data: {
        days: 30,
        authRefresh: {
          total: 10,
          failures: 2,
          failureRate: 0.2,
          reuseDetected: 1,
          trendByDay: [{ day: '2026-02-17', total: 3, failures: 1, reuseDetected: 0 }],
        },
        journeyConsistency: {
          level: 'healthy',
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
      },
      loading: false,
      error: '',
      refetch: vi.fn(),
    });
  });

  it('renders dashboard title and trend cards', () => {
    render(<StudyHealthPage />);
    expect(screen.getByRole('heading', { name: 'Review stats & system health' })).toBeInTheDocument();
    expect(screen.getByText('Refresh failures')).toBeInTheDocument();
    expect(screen.getByText('Journey mismatch rate')).toBeInTheDocument();
    expect(screen.getByText('Study API latency (p95)')).toBeInTheDocument();
    expect(screen.getByText('Review throughput')).toBeInTheDocument();
  });
});
