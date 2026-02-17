import { StudyHealthDashboardService } from '@/services/study-health-dashboard.service';

type AlertSeverity = 'warning' | 'critical';

export interface StudyHealthAlert {
  id:
    | 'journey_mismatch_rate'
    | 'refresh_failure_rate'
    | 'refresh_reuse_detected'
    | 'study_api_p95_latency';
  severity: AlertSeverity;
  triggered: boolean;
  message: string;
  value: number;
  threshold: number;
}

export interface StudyHealthAlertsReport {
  days: number;
  generatedAt: string;
  triggeredCount: number;
  highestSeverity: AlertSeverity | null;
  alerts: StudyHealthAlert[];
}

const ALERT_THRESHOLDS = {
  refreshFailureRate: 0.1,
  refreshMinSampleSize: 20,
  studyApiP95Ms: 1500,
} as const;

export class StudyHealthAlertsService {
  private readonly dashboardService = new StudyHealthDashboardService();

  async getAlerts(userId: string, days: number): Promise<StudyHealthAlertsReport> {
    const dashboard = await this.dashboardService.getDashboard(userId, days);

    const alerts: StudyHealthAlert[] = [
      {
        id: 'journey_mismatch_rate',
        severity: 'critical',
        triggered: dashboard.journeyConsistency.mismatchRate >= dashboard.journeyConsistency.thresholds.major,
        message: 'Journey mismatch rate above major threshold',
        value: dashboard.journeyConsistency.mismatchRate,
        threshold: dashboard.journeyConsistency.thresholds.major,
      },
      {
        id: 'refresh_failure_rate',
        severity: 'warning',
        triggered:
          dashboard.authRefresh.total >= ALERT_THRESHOLDS.refreshMinSampleSize &&
          dashboard.authRefresh.failureRate >= ALERT_THRESHOLDS.refreshFailureRate,
        message: 'Refresh failure rate above baseline threshold',
        value: dashboard.authRefresh.failureRate,
        threshold: ALERT_THRESHOLDS.refreshFailureRate,
      },
      {
        id: 'refresh_reuse_detected',
        severity: 'critical',
        triggered: dashboard.authRefresh.reuseDetected > 0,
        message: 'Refresh token reuse/replay detected in window',
        value: dashboard.authRefresh.reuseDetected,
        threshold: 0,
      },
      {
        id: 'study_api_p95_latency',
        severity: 'warning',
        triggered:
          dashboard.studyApiLatency.overall.p95Ms != null &&
          dashboard.studyApiLatency.overall.p95Ms >= ALERT_THRESHOLDS.studyApiP95Ms,
        message: 'Study API p95 latency breached threshold',
        value: dashboard.studyApiLatency.overall.p95Ms ?? 0,
        threshold: ALERT_THRESHOLDS.studyApiP95Ms,
      },
    ];

    const triggered = alerts.filter((a) => a.triggered);
    const highestSeverity: AlertSeverity | null = triggered.some((a) => a.severity === 'critical')
      ? 'critical'
      : triggered.some((a) => a.severity === 'warning')
        ? 'warning'
        : null;

    return {
      days: dashboard.days,
      generatedAt: new Date().toISOString(),
      triggeredCount: triggered.length,
      highestSeverity,
      alerts,
    };
  }
}
