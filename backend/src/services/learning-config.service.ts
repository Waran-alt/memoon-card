import { pool } from '@/config/database';
import type { UserSettings } from '@/types/database';
import { STUDY_INTERVAL } from '@/constants/study.constants';
import {
  getShortFSRSConfig,
  type ShortFSRSConfig,
  type ShortFSParams,
} from '@/services/short-fsrs.service';

export interface LearningConfig extends ShortFSRSConfig {
  /** Fitted short-FSRS params from optimizer (optional). */
  shortFsrsParams?: ShortFSParams | null;
}

export class LearningConfigService {
  async isShortTermLearningEnabled(userId: string): Promise<boolean> {
    const { FeatureFlagService, FEATURE_FLAGS } = await import('@/services/feature-flag.service');
    const flag = new FeatureFlagService();
    return flag.isEnabledForUser({
      flagKey: FEATURE_FLAGS.shortTermLearning,
      userId,
      fallback: false,
    });
  }

  /** Default config when Short-FSRS is enabled but user has no user_settings row (e.g. new user). */
  getDefaultLearningConfig(): LearningConfig {
    return {
      ...getShortFSRSConfig(null),
      shortFsrsParams: null,
    };
  }

  async getLearningConfig(userId: string): Promise<LearningConfig | null> {
    const result = await pool.query<UserSettings>(
      'SELECT learning_graduation_cap_days, learning_target_retention_short, learning_min_interval_minutes, learning_short_fsrs_params FROM user_settings WHERE user_id = $1',
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;

    const rawParams = row.learning_short_fsrs_params;
    const shortFsrsParams: ShortFSParams | null =
      rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
        ? (rawParams as ShortFSParams)
        : null;

    const capDays = Number(row.learning_graduation_cap_days);
    const targetShort = Number(row.learning_target_retention_short);
    const minMin = Number(row.learning_min_interval_minutes);

    return {
      ...getShortFSRSConfig({
        graduationCapDays: Number.isFinite(capDays) ? capDays : 1,
        targetRetentionShort: Number.isFinite(targetShort) && targetShort > 0 && targetShort < 1 ? targetShort : 0.85,
        minIntervalMinutes: Number.isFinite(minMin) && minMin >= STUDY_INTERVAL.MIN_INTERVAL_MINUTES ? minMin : STUDY_INTERVAL.MIN_INTERVAL_MINUTES,
        maxIntervalMinutes: 24 * 60,
      }),
      shortFsrsParams: shortFsrsParams ?? null,
    };
  }
}
