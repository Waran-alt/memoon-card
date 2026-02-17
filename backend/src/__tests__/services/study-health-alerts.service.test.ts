import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyHealthAlertsService } from '@/services/study-health-alerts.service';

const getDashboardMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/study-health-dashboard.service', () => ({
  StudyHealthDashboardService: vi.fn().mockImplementation(() => ({
    getDashboard: getDashboardMock,
  })),
}));

describe('StudyHealthAlertsService', () => {
  const service = new StudyHealthAlertsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no triggered alerts for healthy metrics', async () => {
    getDashboardMock.mockResolvedValue({
      days: 30,
      authRefresh: { total: 25, failures: 1, failureRate: 0.04, reuseDetected: 0, trendByDay: [] },
      journeyConsistency: {
        level: 'healthy',
        mismatchRate: 0.005,
        thresholds: { minor: 0.01, major: 0.05 },
        trendByDay: [],
      },
      studyApiLatency: {
        overall: { sampleCount: 100, p50Ms: 120, p95Ms: 400, p99Ms: 700 },
        byRoute: [],
        trendByDay: [],
      },
      reviewThroughputByDay: [],
    });

    const report = await service.getAlerts('user-1', 30);
    expect(report.triggeredCount).toBe(0);
    expect(report.highestSeverity).toBeNull();
  });

  it('triggers warning and critical alerts for anomalous metrics', async () => {
    getDashboardMock.mockResolvedValue({
      days: 30,
      authRefresh: { total: 40, failures: 7, failureRate: 0.175, reuseDetected: 2, trendByDay: [] },
      journeyConsistency: {
        level: 'needs_attention',
        mismatchRate: 0.08,
        thresholds: { minor: 0.01, major: 0.05 },
        trendByDay: [],
      },
      studyApiLatency: {
        overall: { sampleCount: 150, p50Ms: 220, p95Ms: 1800, p99Ms: 2400 },
        byRoute: [],
        trendByDay: [],
      },
      reviewThroughputByDay: [],
    });

    const report = await service.getAlerts('user-1', 30);
    expect(report.triggeredCount).toBe(4);
    expect(report.highestSeverity).toBe('critical');
    expect(report.alerts.map((a) => a.id)).toEqual([
      'journey_mismatch_rate',
      'refresh_failure_rate',
      'refresh_reuse_detected',
      'study_api_p95_latency',
    ]);
    expect(report.alerts.every((a) => a.triggered)).toBe(true);
  });
});
