import {
  FSRS_METRICS_JOB_ENABLED,
  FSRS_METRICS_JOB_INTERVAL_MINUTES,
  FSRS_METRICS_JOB_BACKFILL_DAYS,
  NODE_ENV,
} from '@/config/env';
import { pool } from '@/config/database';
import { FsrsMetricsService } from '@/services/fsrs-metrics.service';
import { logger, serializeError } from '@/utils/logger';

const DEFAULT_INTERVAL_MINUTES = 24 * 60;
const DEFAULT_BACKFILL_DAYS = 7;

function isJobEnabled(): boolean {
  if (NODE_ENV === 'test') return false;
  if (FSRS_METRICS_JOB_ENABLED == null) return true;
  return FSRS_METRICS_JOB_ENABLED === 'true';
}

function getIntervalMs(): number {
  const minutes = FSRS_METRICS_JOB_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES;
  return Math.max(1, minutes) * 60 * 1000;
}

function getBackfillDays(): number {
  return Math.max(1, FSRS_METRICS_JOB_BACKFILL_DAYS ?? DEFAULT_BACKFILL_DAYS);
}

export class FsrsMetricsJobService {
  private readonly fsrsMetricsService = new FsrsMetricsService();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const startedAt = Date.now();

    try {
      const result = await pool.query<{ user_id: string }>(
        `
        SELECT DISTINCT user_id
        FROM review_logs
        WHERE review_date::date >= (CURRENT_DATE - ($1::int - 1))
        `,
        [getBackfillDays()]
      );

      for (const row of result.rows) {
        await this.fsrsMetricsService.refreshRecentMetrics(row.user_id, getBackfillDays());
      }

      logger.info('FSRS metrics job completed', {
        userCount: result.rows.length,
        backfillDays: getBackfillDays(),
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      logger.error('FSRS metrics job failed', {
        error: serializeError(error),
      });
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (!isJobEnabled()) {
      logger.info('FSRS metrics job disabled', { env: NODE_ENV });
      return;
    }
    if (this.timer) return;

    void this.runOnce();

    this.timer = setInterval(() => {
      void this.runOnce();
    }, getIntervalMs());
    this.timer.unref();

    logger.info('FSRS metrics job started', {
      intervalMinutes: getIntervalMs() / 60000,
      backfillDays: getBackfillDays(),
    });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('FSRS metrics job stopped');
  }
}
