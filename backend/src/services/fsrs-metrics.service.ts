import { pool } from '@/config/database';

const DEFAULT_DAYS = 30;
const REVIEW_WINDOWS = [100, 300, 1000] as const;
const SESSION_WINDOW_COUNT = 10;

type Numeric = string | number | null | undefined;

function toNumber(value: Numeric): number | null {
  if (value == null) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function toInt(value: Numeric): number {
  const num = toNumber(value);
  return num == null ? 0 : Math.round(num);
}

function reliabilityFromSampleSize(sampleSize: number): 'low' | 'medium' | 'high' {
  if (sampleSize < 50) return 'low';
  if (sampleSize < 200) return 'medium';
  return 'high';
}

export interface DailyMetricRow {
  metricDate: string;
  reviewCount: number;
  passCount: number;
  failCount: number;
  avgPredictedRecall: number | null;
  observedRecallRate: number | null;
  brierScore: number | null;
  meanReviewDurationMs: number | null;
  p50ReviewDurationMs: number | null;
  p90ReviewDurationMs: number | null;
  avgElapsedDays: number | null;
  avgScheduledDays: number | null;
  sessionCount: number | null;
}

export interface SessionMetricRow {
  sessionId: string;
  sessionDate: string;
  sessionStartedAt: number | null;
  sessionEndedAt: number | null;
  reviewCount: number;
  passCount: number;
  failCount: number;
  avgPredictedRecall: number | null;
  observedRecallRate: number | null;
  brierScore: number | null;
  meanReviewDurationMs: number | null;
  fatigueSlope: number | null;
}

export interface MetricsSummary {
  days: number;
  current: {
    reviewCount: number;
    passCount: number;
    failCount: number;
    observedRecallRate: number | null;
    avgPredictedRecall: number | null;
    avgBrierScore: number | null;
    reliability: 'low' | 'medium' | 'high';
  };
  previous: {
    reviewCount: number;
    passCount: number;
    failCount: number;
    observedRecallRate: number | null;
    avgPredictedRecall: number | null;
    avgBrierScore: number | null;
  };
  deltas: {
    reviewCount: number;
    observedRecallRate: number | null;
    avgPredictedRecall: number | null;
    avgBrierScore: number | null;
  };
}

export interface ReviewWindowMetric {
  windowSize: number;
  reviewCount: number;
  passCount: number;
  failCount: number;
  observedRecallRate: number | null;
  avgPredictedRecall: number | null;
  brierScore: number | null;
  reliability: 'low' | 'medium' | 'high';
}

export interface SessionWindowMetric {
  sessionCount: number;
  reviewCount: number;
  observedRecallRate: number | null;
  avgBrierScore: number | null;
  avgFatigueSlope: number | null;
}

/** Learning-phase (New/Learning/Relearning) vs graduated (Review) counts for a period. */
export interface LearningVsGraduatedCounts {
  learningReviewCount: number;
  graduatedReviewCount: number;
}

/** Study stats filtered by category (from review_logs + card_categories). */
export interface StudyStatsByCategory {
  summary: MetricsSummary;
  daily: DailyMetricRow[];
  learningVsGraduated: LearningVsGraduatedCounts;
}

export class FsrsMetricsService {
  private normalizeDays(days?: number): number {
    return Number.isInteger(days) && days && days > 0 ? days : DEFAULT_DAYS;
  }

  async refreshRecentMetrics(userId: string, days?: number): Promise<void> {
    const normalizedDays = this.normalizeDays(days);

    await pool.query(
      `
      WITH daily_source AS (
        SELECT
          user_id,
          review_date::date AS metric_date,
          COUNT(*)::int AS review_count,
          COUNT(*) FILTER (WHERE rating IN (2, 3, 4))::int AS pass_count,
          COUNT(*) FILTER (WHERE rating = 1)::int AS fail_count,
          AVG(retrievability_before) AS avg_predicted_recall,
          AVG(CASE WHEN rating IN (2, 3, 4) THEN 1.0 ELSE 0.0 END) AS observed_recall_rate,
          AVG(
            CASE
              WHEN retrievability_before IS NULL THEN NULL
              ELSE POWER(retrievability_before - CASE WHEN rating IN (2, 3, 4) THEN 1.0 ELSE 0.0 END, 2)
            END
          ) AS brier_score,
          AVG(review_duration) FILTER (WHERE review_duration IS NOT NULL) AS mean_review_duration_ms,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY review_duration)
            FILTER (WHERE review_duration IS NOT NULL) AS p50_review_duration_ms,
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY review_duration)
            FILTER (WHERE review_duration IS NOT NULL) AS p90_review_duration_ms,
          AVG(elapsed_days) AS avg_elapsed_days,
          AVG(scheduled_days) AS avg_scheduled_days,
          COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)::int AS session_count
        FROM review_logs
        WHERE user_id = $1
          AND review_date::date >= (CURRENT_DATE - ($2::int - 1))
        GROUP BY user_id, review_date::date
      )
      INSERT INTO user_fsrs_daily_metrics (
        user_id, metric_date, review_count, pass_count, fail_count,
        avg_predicted_recall, observed_recall_rate, brier_score,
        mean_review_duration_ms, p50_review_duration_ms, p90_review_duration_ms,
        avg_elapsed_days, avg_scheduled_days, session_count, updated_at
      )
      SELECT
        user_id,
        metric_date,
        review_count,
        pass_count,
        fail_count,
        avg_predicted_recall,
        observed_recall_rate,
        brier_score,
        mean_review_duration_ms,
        ROUND(p50_review_duration_ms)::int,
        ROUND(p90_review_duration_ms)::int,
        avg_elapsed_days,
        avg_scheduled_days,
        session_count,
        NOW()
      FROM daily_source
      ON CONFLICT (user_id, metric_date)
      DO UPDATE SET
        review_count = EXCLUDED.review_count,
        pass_count = EXCLUDED.pass_count,
        fail_count = EXCLUDED.fail_count,
        avg_predicted_recall = EXCLUDED.avg_predicted_recall,
        observed_recall_rate = EXCLUDED.observed_recall_rate,
        brier_score = EXCLUDED.brier_score,
        mean_review_duration_ms = EXCLUDED.mean_review_duration_ms,
        p50_review_duration_ms = EXCLUDED.p50_review_duration_ms,
        p90_review_duration_ms = EXCLUDED.p90_review_duration_ms,
        avg_elapsed_days = EXCLUDED.avg_elapsed_days,
        avg_scheduled_days = EXCLUDED.avg_scheduled_days,
        session_count = EXCLUDED.session_count,
        updated_at = NOW()
      `,
      [userId, normalizedDays]
    );

    await pool.query(
      `
      WITH session_rows AS (
        SELECT
          user_id,
          session_id,
          review_date,
          review_time,
          shown_at,
          rating,
          review_duration,
          retrievability_before,
          CASE WHEN rating IN (2, 3, 4) THEN 1.0 ELSE 0.0 END AS outcome,
          ROW_NUMBER() OVER (PARTITION BY user_id, session_id ORDER BY review_time) AS review_index
        FROM review_logs
        WHERE user_id = $1
          AND session_id IS NOT NULL
          AND review_date::date >= (CURRENT_DATE - ($2::int - 1))
      ),
      session_agg AS (
        SELECT
          user_id,
          session_id,
          MIN(review_date)::date AS session_date,
          MIN(COALESCE(shown_at, review_time)) AS session_started_at,
          MAX(review_time) AS session_ended_at,
          COUNT(*)::int AS review_count,
          COUNT(*) FILTER (WHERE rating IN (2, 3, 4))::int AS pass_count,
          COUNT(*) FILTER (WHERE rating = 1)::int AS fail_count,
          AVG(retrievability_before) AS avg_predicted_recall,
          AVG(outcome) AS observed_recall_rate,
          AVG(
            CASE
              WHEN retrievability_before IS NULL THEN NULL
              ELSE POWER(retrievability_before - outcome, 2)
            END
          ) AS brier_score,
          AVG(review_duration) FILTER (WHERE review_duration IS NOT NULL) AS mean_review_duration_ms,
          REGR_SLOPE(outcome, review_index::double precision) AS fatigue_slope
        FROM session_rows
        GROUP BY user_id, session_id
      )
      INSERT INTO user_fsrs_session_metrics (
        user_id, session_id, session_date, session_started_at, session_ended_at,
        review_count, pass_count, fail_count,
        avg_predicted_recall, observed_recall_rate, brier_score,
        mean_review_duration_ms, fatigue_slope, updated_at
      )
      SELECT
        user_id, session_id, session_date, session_started_at, session_ended_at,
        review_count, pass_count, fail_count,
        avg_predicted_recall, observed_recall_rate, brier_score,
        mean_review_duration_ms, fatigue_slope, NOW()
      FROM session_agg
      ON CONFLICT (user_id, session_id)
      DO UPDATE SET
        session_date = EXCLUDED.session_date,
        session_started_at = EXCLUDED.session_started_at,
        session_ended_at = EXCLUDED.session_ended_at,
        review_count = EXCLUDED.review_count,
        pass_count = EXCLUDED.pass_count,
        fail_count = EXCLUDED.fail_count,
        avg_predicted_recall = EXCLUDED.avg_predicted_recall,
        observed_recall_rate = EXCLUDED.observed_recall_rate,
        brier_score = EXCLUDED.brier_score,
        mean_review_duration_ms = EXCLUDED.mean_review_duration_ms,
        fatigue_slope = EXCLUDED.fatigue_slope,
        updated_at = NOW()
      `,
      [userId, normalizedDays]
    );
  }

  async getDailyMetrics(userId: string, days?: number): Promise<DailyMetricRow[]> {
    const normalizedDays = this.normalizeDays(days);
    await this.refreshRecentMetrics(userId, normalizedDays);

    const result = await pool.query(
      `
      SELECT
        metric_date,
        review_count,
        pass_count,
        fail_count,
        avg_predicted_recall,
        observed_recall_rate,
        brier_score,
        mean_review_duration_ms,
        p50_review_duration_ms,
        p90_review_duration_ms,
        avg_elapsed_days,
        avg_scheduled_days,
        session_count
      FROM user_fsrs_daily_metrics
      WHERE user_id = $1
        AND metric_date >= (CURRENT_DATE - ($2::int - 1))
      ORDER BY metric_date DESC
      `,
      [userId, normalizedDays]
    );

    return result.rows.map((row) => ({
      metricDate: String(row.metric_date),
      reviewCount: toInt(row.review_count),
      passCount: toInt(row.pass_count),
      failCount: toInt(row.fail_count),
      avgPredictedRecall: toNumber(row.avg_predicted_recall),
      observedRecallRate: toNumber(row.observed_recall_rate),
      brierScore: toNumber(row.brier_score),
      meanReviewDurationMs: toNumber(row.mean_review_duration_ms),
      p50ReviewDurationMs: toNumber(row.p50_review_duration_ms),
      p90ReviewDurationMs: toNumber(row.p90_review_duration_ms),
      avgElapsedDays: toNumber(row.avg_elapsed_days),
      avgScheduledDays: toNumber(row.avg_scheduled_days),
      sessionCount: toNumber(row.session_count),
    }));
  }

  async getLearningVsGraduatedCounts(userId: string, days?: number): Promise<LearningVsGraduatedCounts> {
    const normalizedDays = this.normalizeDays(days);
    const result = await pool.query<{ learning_count: string; graduated_count: string }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(review_state, -1) IN (0, 1, 3))::int AS learning_count,
        COUNT(*) FILTER (WHERE review_state = 2)::int AS graduated_count
      FROM review_logs
      WHERE user_id = $1
        AND review_date::date >= (CURRENT_DATE - ($2::int - 1))
      `,
      [userId, normalizedDays]
    );
    const row = result.rows[0];
    return {
      learningReviewCount: toInt(row?.learning_count),
      graduatedReviewCount: toInt(row?.graduated_count),
    };
  }

  private categoryFilterJoin = `INNER JOIN card_categories cc ON cc.card_id = r.card_id AND cc.category_id = $3`;

  /**
   * Study stats restricted to reviews of cards in the given category.
   * Category must belong to user (caller validates).
   */
  async getStudyStatsByCategory(
    userId: string,
    days: number,
    categoryId: string
  ): Promise<StudyStatsByCategory> {
    const normalizedDays = this.normalizeDays(days);
    const baseWhere = `r.user_id = $1 AND r.review_date::date >= (CURRENT_DATE - ($2::int - 1))`;

    const [summaryResult, dailyResult, learningResult] = await Promise.all([
      pool.query<{
        review_count: string;
        pass_count: string;
        fail_count: string;
        observed_recall_rate: number | null;
      }>(
        `SELECT
          COUNT(*)::int AS review_count,
          COUNT(*) FILTER (WHERE r.rating IN (2, 3, 4))::int AS pass_count,
          COUNT(*) FILTER (WHERE r.rating = 1)::int AS fail_count,
          CASE WHEN COUNT(*) = 0 THEN NULL ELSE COUNT(*) FILTER (WHERE r.rating IN (2, 3, 4))::double precision / COUNT(*) END AS observed_recall_rate
         FROM review_logs r
         ${this.categoryFilterJoin}
         WHERE ${baseWhere}`,
        [userId, normalizedDays, categoryId]
      ),
      pool.query<{ metric_date: string; review_count: string; pass_count: string; fail_count: string }>(
        `SELECT
          r.review_date::date AS metric_date,
          COUNT(*)::int AS review_count,
          COUNT(*) FILTER (WHERE r.rating IN (2, 3, 4))::int AS pass_count,
          COUNT(*) FILTER (WHERE r.rating = 1)::int AS fail_count
         FROM review_logs r
         ${this.categoryFilterJoin}
         WHERE ${baseWhere}
         GROUP BY r.review_date::date
         ORDER BY metric_date DESC`,
        [userId, normalizedDays, categoryId]
      ),
      pool.query<{ learning_count: string; graduated_count: string }>(
        `SELECT
          COUNT(*) FILTER (WHERE COALESCE(r.review_state, -1) IN (0, 1, 3))::int AS learning_count,
          COUNT(*) FILTER (WHERE r.review_state = 2)::int AS graduated_count
         FROM review_logs r
         ${this.categoryFilterJoin}
         WHERE ${baseWhere}`,
        [userId, normalizedDays, categoryId]
      ),
    ]);

    const summaryRow = summaryResult.rows[0];
    const reviewCount = toInt(summaryRow?.review_count);
    const passCount = toInt(summaryRow?.pass_count);
    const failCount = toInt(summaryRow?.fail_count);

    const summary: MetricsSummary = {
      days: normalizedDays,
      current: {
        reviewCount,
        passCount,
        failCount,
        observedRecallRate: toNumber(summaryRow?.observed_recall_rate) ?? null,
        avgPredictedRecall: null,
        avgBrierScore: null,
        reliability: reliabilityFromSampleSize(reviewCount),
      },
      previous: {
        reviewCount: 0,
        passCount: 0,
        failCount: 0,
        observedRecallRate: null,
        avgPredictedRecall: null,
        avgBrierScore: null,
      },
      deltas: {
        reviewCount: 0,
        observedRecallRate: null,
        avgPredictedRecall: null,
        avgBrierScore: null,
      },
    };

    const daily: DailyMetricRow[] = dailyResult.rows.map((row) => ({
      metricDate: String(row.metric_date),
      reviewCount: toInt(row.review_count),
      passCount: toInt(row.pass_count),
      failCount: toInt(row.fail_count),
      avgPredictedRecall: null,
      observedRecallRate: null,
      brierScore: null,
      meanReviewDurationMs: null,
      p50ReviewDurationMs: null,
      p90ReviewDurationMs: null,
      avgElapsedDays: null,
      avgScheduledDays: null,
      sessionCount: null,
    }));

    const lvRow = learningResult.rows[0];
    const learningVsGraduated: LearningVsGraduatedCounts = {
      learningReviewCount: toInt(lvRow?.learning_count),
      graduatedReviewCount: toInt(lvRow?.graduated_count),
    };

    return { summary, daily, learningVsGraduated };
  }

  async getSessionMetrics(userId: string, days?: number): Promise<SessionMetricRow[]> {
    const normalizedDays = this.normalizeDays(days);
    await this.refreshRecentMetrics(userId, normalizedDays);

    const result = await pool.query(
      `
      SELECT
        session_id,
        session_date,
        session_started_at,
        session_ended_at,
        review_count,
        pass_count,
        fail_count,
        avg_predicted_recall,
        observed_recall_rate,
        brier_score,
        mean_review_duration_ms,
        fatigue_slope
      FROM user_fsrs_session_metrics
      WHERE user_id = $1
        AND session_date >= (CURRENT_DATE - ($2::int - 1))
      ORDER BY COALESCE(session_started_at, 0) DESC
      `,
      [userId, normalizedDays]
    );

    return result.rows.map((row) => ({
      sessionId: String(row.session_id),
      sessionDate: String(row.session_date),
      sessionStartedAt: toNumber(row.session_started_at),
      sessionEndedAt: toNumber(row.session_ended_at),
      reviewCount: toInt(row.review_count),
      passCount: toInt(row.pass_count),
      failCount: toInt(row.fail_count),
      avgPredictedRecall: toNumber(row.avg_predicted_recall),
      observedRecallRate: toNumber(row.observed_recall_rate),
      brierScore: toNumber(row.brier_score),
      meanReviewDurationMs: toNumber(row.mean_review_duration_ms),
      fatigueSlope: toNumber(row.fatigue_slope),
    }));
  }

  async getSummary(userId: string, days?: number): Promise<MetricsSummary> {
    const normalizedDays = this.normalizeDays(days);
    await this.refreshRecentMetrics(userId, normalizedDays * 2);

    const aggregateWindow = async (startDayOffset: number, endDayOffset: number) => {
      const result = await pool.query(
        `
        SELECT
          COALESCE(SUM(review_count), 0)::int AS review_count,
          COALESCE(SUM(pass_count), 0)::int AS pass_count,
          COALESCE(SUM(fail_count), 0)::int AS fail_count,
          CASE
            WHEN COALESCE(SUM(review_count), 0) = 0 THEN NULL
            ELSE SUM(pass_count)::double precision / SUM(review_count)
          END AS observed_recall_rate,
          CASE
            WHEN COALESCE(SUM(review_count), 0) = 0 THEN NULL
            ELSE SUM(COALESCE(avg_predicted_recall, 0) * review_count)::double precision / SUM(review_count)
          END AS avg_predicted_recall,
          CASE
            WHEN COALESCE(SUM(review_count), 0) = 0 THEN NULL
            ELSE SUM(COALESCE(brier_score, 0) * review_count)::double precision / SUM(review_count)
          END AS avg_brier_score
        FROM user_fsrs_daily_metrics
        WHERE user_id = $1
          AND metric_date BETWEEN (CURRENT_DATE - $2::int) AND (CURRENT_DATE - $3::int)
        `,
        [userId, startDayOffset, endDayOffset]
      );
      return result.rows[0];
    };

    const current = await aggregateWindow(normalizedDays - 1, 0);
    const previous = await aggregateWindow(normalizedDays * 2 - 1, normalizedDays);

    const currentReviewCount = toInt(current.review_count);
    const currentObserved = toNumber(current.observed_recall_rate);
    const currentPredicted = toNumber(current.avg_predicted_recall);
    const currentBrier = toNumber(current.avg_brier_score);

    const previousObserved = toNumber(previous.observed_recall_rate);
    const previousPredicted = toNumber(previous.avg_predicted_recall);
    const previousBrier = toNumber(previous.avg_brier_score);

    return {
      days: normalizedDays,
      current: {
        reviewCount: currentReviewCount,
        passCount: toInt(current.pass_count),
        failCount: toInt(current.fail_count),
        observedRecallRate: currentObserved,
        avgPredictedRecall: currentPredicted,
        avgBrierScore: currentBrier,
        reliability: reliabilityFromSampleSize(currentReviewCount),
      },
      previous: {
        reviewCount: toInt(previous.review_count),
        passCount: toInt(previous.pass_count),
        failCount: toInt(previous.fail_count),
        observedRecallRate: previousObserved,
        avgPredictedRecall: previousPredicted,
        avgBrierScore: previousBrier,
      },
      deltas: {
        reviewCount: currentReviewCount - toInt(previous.review_count),
        observedRecallRate:
          currentObserved != null && previousObserved != null ? currentObserved - previousObserved : null,
        avgPredictedRecall:
          currentPredicted != null && previousPredicted != null ? currentPredicted - previousPredicted : null,
        avgBrierScore: currentBrier != null && previousBrier != null ? currentBrier - previousBrier : null,
      },
    };
  }

  async getWindows(userId: string): Promise<{
    reviewWindows: ReviewWindowMetric[];
    sessionWindow: SessionWindowMetric;
  }> {
    await this.refreshRecentMetrics(userId, 180);

    const reviewWindows: ReviewWindowMetric[] = [];

    for (const windowSize of REVIEW_WINDOWS) {
      const result = await pool.query(
        `
        WITH latest_reviews AS (
          SELECT rating, retrievability_before
          FROM review_logs
          WHERE user_id = $1
          ORDER BY review_time DESC
          LIMIT $2
        )
        SELECT
          COUNT(*)::int AS review_count,
          COUNT(*) FILTER (WHERE rating IN (2, 3, 4))::int AS pass_count,
          COUNT(*) FILTER (WHERE rating = 1)::int AS fail_count,
          AVG(CASE WHEN rating IN (2, 3, 4) THEN 1.0 ELSE 0.0 END) AS observed_recall_rate,
          AVG(retrievability_before) AS avg_predicted_recall,
          AVG(
            CASE
              WHEN retrievability_before IS NULL THEN NULL
              ELSE POWER(retrievability_before - CASE WHEN rating IN (2, 3, 4) THEN 1.0 ELSE 0.0 END, 2)
            END
          ) AS brier_score
        FROM latest_reviews
        `,
        [userId, windowSize]
      );

      const row = result.rows[0];
      const reviewCount = toInt(row.review_count);
      reviewWindows.push({
        windowSize,
        reviewCount,
        passCount: toInt(row.pass_count),
        failCount: toInt(row.fail_count),
        observedRecallRate: toNumber(row.observed_recall_rate),
        avgPredictedRecall: toNumber(row.avg_predicted_recall),
        brierScore: toNumber(row.brier_score),
        reliability: reliabilityFromSampleSize(reviewCount),
      });
    }

    const sessionResult = await pool.query(
      `
      WITH latest_sessions AS (
        SELECT
          review_count,
          pass_count,
          fail_count,
          brier_score,
          fatigue_slope
        FROM user_fsrs_session_metrics
        WHERE user_id = $1
        ORDER BY COALESCE(session_started_at, 0) DESC
        LIMIT $2
      )
      SELECT
        COUNT(*)::int AS session_count,
        COALESCE(SUM(review_count), 0)::int AS review_count,
        CASE
          WHEN COALESCE(SUM(review_count), 0) = 0 THEN NULL
          ELSE SUM(pass_count)::double precision / SUM(review_count)
        END AS observed_recall_rate,
        AVG(brier_score) AS avg_brier_score,
        AVG(fatigue_slope) AS avg_fatigue_slope
      FROM latest_sessions
      `,
      [userId, SESSION_WINDOW_COUNT]
    );

    const sessionRow = sessionResult.rows[0];

    return {
      reviewWindows,
      sessionWindow: {
        sessionCount: toInt(sessionRow.session_count),
        reviewCount: toInt(sessionRow.review_count),
        observedRecallRate: toNumber(sessionRow.observed_recall_rate),
        avgBrierScore: toNumber(sessionRow.avg_brier_score),
        avgFatigueSlope: toNumber(sessionRow.avg_fatigue_slope),
      },
    };
  }

}
