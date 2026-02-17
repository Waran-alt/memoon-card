import { createHash } from 'crypto';
import { pool } from '@/config/database';
import { logger } from '@/utils/logger';

export const FEATURE_FLAGS = {
  adaptiveRetentionPolicy: 'adaptive_retention_policy',
  day1ShortLoopPolicy: 'day1_short_loop_policy',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

function bucketForUser(userId: string, flagKey: string): number {
  const hex = createHash('sha256').update(`${flagKey}:${userId}`).digest('hex').slice(0, 8);
  const value = Number.parseInt(hex, 16);
  return Number.isFinite(value) ? value % 100 : 0;
}

export class FeatureFlagService {
  async isEnabledForUser(input: {
    flagKey: FeatureFlagKey;
    userId: string;
    fallback: boolean;
  }): Promise<boolean> {
    try {
      const overrideResult = await pool.query<{ enabled: boolean }>(
        `
        SELECT enabled
        FROM feature_flag_user_overrides
        WHERE flag_key = $1
          AND user_id = $2
        LIMIT 1
        `,
        [input.flagKey, input.userId]
      );
      const override = overrideResult.rows[0];
      if (override) return !!override.enabled;

      const flagResult = await pool.query<{ enabled: boolean; rollout_percentage: number }>(
        `
        SELECT enabled, rollout_percentage
        FROM feature_flags
        WHERE flag_key = $1
        LIMIT 1
        `,
        [input.flagKey]
      );
      const flag = flagResult.rows[0];
      if (!flag) return input.fallback;
      if (!flag.enabled) return false;

      const rollout = Math.max(0, Math.min(100, Number(flag.rollout_percentage ?? 0)));
      if (rollout >= 100) return true;
      if (rollout <= 0) return false;

      return bucketForUser(input.userId, input.flagKey) < rollout;
    } catch (error) {
      logger.warn('Feature flag evaluation failed; using fallback', {
        flagKey: input.flagKey,
        userId: input.userId,
        fallback: input.fallback,
        error: error instanceof Error ? error.message : String(error),
      });
      return input.fallback;
    }
  }
}
