import { pool } from '@/config/database';
import type { Card, UserSettings } from '@/types/database';
import {
  getShortFSRSConfig,
  type ShortFSRSConfig,
  type ShortFSParams,
} from '@/services/short-fsrs.service';

export interface LearningConfig extends ShortFSRSConfig {
  maxAttemptsBeforeGraduate: number;
  applyToLapses: 'always' | 'within_days' | 'off';
  lapseWithinDays: number | null;
  /** Fitted short-FSRS params from optimizer (optional). */
  shortFsrsParams?: ShortFSParams | null;
}

const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  ...getShortFSRSConfig(null),
  maxAttemptsBeforeGraduate: 7,
  applyToLapses: 'always',
  lapseWithinDays: null,
};

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

  async getLearningConfig(userId: string): Promise<LearningConfig | null> {
    const result = await pool.query<UserSettings>(
      'SELECT learning_graduation_cap_days, learning_target_retention_short, learning_min_interval_minutes, learning_max_attempts_before_graduate, learning_apply_to_lapses, learning_lapse_within_days, learning_short_fsrs_params FROM user_settings WHERE user_id = $1',
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
    const maxAttempts = Number(row.learning_max_attempts_before_graduate);
    const applyToLapses = (row.learning_apply_to_lapses as 'always' | 'within_days' | 'off') ?? 'always';
    const lapseWithinDays = row.learning_lapse_within_days != null ? Number(row.learning_lapse_within_days) : null;

    return {
      ...getShortFSRSConfig({
        graduationCapDays: Number.isFinite(capDays) ? capDays : 1,
        targetRetentionShort: Number.isFinite(targetShort) && targetShort > 0 && targetShort < 1 ? targetShort : 0.85,
        minIntervalMinutes: Number.isFinite(minMin) && minMin >= 1 ? minMin : 1,
        maxIntervalMinutes: 24 * 60,
      }),
      maxAttemptsBeforeGraduate: Number.isFinite(maxAttempts) && maxAttempts >= 1 ? maxAttempts : 7,
      applyToLapses,
      lapseWithinDays,
      shortFsrsParams: shortFsrsParams ?? null,
    };
  }

  shouldApplyLearningToLapse(card: Card, config: LearningConfig): boolean {
    if (config.applyToLapses === 'off') return false;
    if (config.applyToLapses === 'always') return true;
    if (config.applyToLapses === 'within_days' && config.lapseWithinDays != null && card.last_review) {
      const days = (Date.now() - new Date(card.last_review).getTime()) / (24 * 60 * 60 * 1000);
      return days <= config.lapseWithinDays;
    }
    return false;
  }
}
