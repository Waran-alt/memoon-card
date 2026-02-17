import { pool } from '@/config/database';
import { CardJourneyService } from '@/services/card-journey.service';

function toInt(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface StudyApiLatencyRow {
  route: string;
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

export interface StudyAuthHealthDashboard {
  days: number;
  authRefresh: {
    total: number;
    failures: number;
    failureRate: number;
    reuseDetected: number;
  };
  journeyConsistency: {
    level: 'healthy' | 'minor_issues' | 'needs_attention';
    mismatchRate: number;
    thresholds: {
      minor: number;
      major: number;
    };
  };
  studyApiLatency: {
    overall: {
      sampleCount: number;
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
    };
    byRoute: StudyApiLatencyRow[];
  };
  reviewThroughputByDay: Array<{ day: string; reviewCount: number }>;
}

export class StudyHealthDashboardService {
  private readonly cardJourneyService = new CardJourneyService();

  async recordAuthRefreshMetric(input: {
    userId?: string | null;
    statusCode: number;
    durationMs: number;
    outcome?: string | null;
  }): Promise<void> {
    await pool.query(
      `
      INSERT INTO user_operational_events (
        user_id, metric_type, route, status_code, duration_ms, outcome
      )
      VALUES ($1, 'auth_refresh', '/api/auth/refresh', $2, $3, $4)
      `,
      [input.userId ?? null, input.statusCode, Math.max(0, Math.round(input.durationMs)), input.outcome ?? null]
    );
  }

  async recordStudyApiMetric(input: {
    userId: string;
    route: '/api/study/sessions' | '/api/study/sessions/:sessionId' | '/api/study/journey-consistency';
    statusCode: number;
    durationMs: number;
  }): Promise<void> {
    await pool.query(
      `
      INSERT INTO user_operational_events (
        user_id, metric_type, route, status_code, duration_ms, outcome
      )
      VALUES ($1, 'study_api', $2, $3, $4, NULL)
      `,
      [input.userId, input.route, input.statusCode, Math.max(0, Math.round(input.durationMs))]
    );
  }

  async getDashboard(userId: string, days: number): Promise<StudyAuthHealthDashboard> {
    const normalizedDays = Math.max(1, Math.min(90, days));

    const [authResult, latencyOverallResult, latencyByRouteResult, throughputResult, consistencyReport] =
      await Promise.all([
        pool.query(
          `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status_code >= 400)::int AS failures,
            COUNT(*) FILTER (WHERE outcome = 'reuse_detected')::int AS reuse_detected
          FROM user_operational_events
          WHERE user_id = $1
            AND metric_type = 'auth_refresh'
            AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
          `,
          [userId, normalizedDays]
        ),
        pool.query(
          `
          SELECT
            COUNT(*)::int AS sample_count,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99_ms
          FROM user_operational_events
          WHERE user_id = $1
            AND metric_type = 'study_api'
            AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
          `,
          [userId, normalizedDays]
        ),
        pool.query(
          `
          SELECT
            route,
            COUNT(*)::int AS sample_count,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99_ms
          FROM user_operational_events
          WHERE user_id = $1
            AND metric_type = 'study_api'
            AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
          GROUP BY route
          ORDER BY route ASC
          `,
          [userId, normalizedDays]
        ),
        pool.query(
          `
          SELECT
            TO_CHAR(review_date::date, 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS review_count
          FROM review_logs
          WHERE user_id = $1
            AND review_date >= NOW() - ($2::int * INTERVAL '1 day')
          GROUP BY review_date::date
          ORDER BY review_date::date DESC
          `,
          [userId, normalizedDays]
        ),
        this.cardJourneyService.getJourneyConsistencyReport(userId, {
          days: normalizedDays,
          sampleLimit: 10,
        }),
      ]);

    const authRow = authResult.rows[0] ?? {};
    const authTotal = toInt(authRow.total);
    const authFailures = toInt(authRow.failures);
    const authReuseDetected = toInt(authRow.reuse_detected);
    const latencyOverallRow = latencyOverallResult.rows[0] ?? {};

    return {
      days: normalizedDays,
      authRefresh: {
        total: authTotal,
        failures: authFailures,
        failureRate: authTotal > 0 ? authFailures / authTotal : 0,
        reuseDetected: authReuseDetected,
      },
      journeyConsistency: {
        level: consistencyReport.health.level,
        mismatchRate: consistencyReport.health.mismatchRate,
        thresholds: consistencyReport.health.thresholds,
      },
      studyApiLatency: {
        overall: {
          sampleCount: toInt(latencyOverallRow.sample_count),
          p50Ms: toNumber(latencyOverallRow.p50_ms),
          p95Ms: toNumber(latencyOverallRow.p95_ms),
          p99Ms: toNumber(latencyOverallRow.p99_ms),
        },
        byRoute: latencyByRouteResult.rows.map((row) => ({
          route: String(row.route),
          sampleCount: toInt(row.sample_count),
          p50Ms: toNumber(row.p50_ms),
          p95Ms: toNumber(row.p95_ms),
          p99Ms: toNumber(row.p99_ms),
        })),
      },
      reviewThroughputByDay: throughputResult.rows.map((row) => ({
        day: String(row.day),
        reviewCount: toInt(row.review_count),
      })),
    };
  }
}
