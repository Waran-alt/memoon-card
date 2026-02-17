import { createHash } from 'crypto';
import { pool } from '@/config/database';
import { logger } from '@/utils/logger';

export const FEATURE_FLAGS = {
  adaptiveRetentionPolicy: 'adaptive_retention_policy',
  day1ShortLoopPolicy: 'day1_short_loop_policy',
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

const FEATURE_FLAG_CACHE_TTL_MS = 30_000;
const FEATURE_FLAG_QUERY_TIMEOUT_MS = 150;
const FEATURE_FLAG_CACHE_MAX_ENTRIES = 5_000;

function bucketForUser(userId: string, flagKey: string): number {
  const hex = createHash('sha256').update(`${flagKey}:${userId}`).digest('hex').slice(0, 8);
  const value = Number.parseInt(hex, 16);
  return Number.isFinite(value) ? value % 100 : 0;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`feature_flag_query_timeout_${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export class FeatureFlagService {
  private static readonly cache = new Map<string, { value: boolean; expiresAt: number }>();

  static clearCacheForTests(): void {
    FeatureFlagService.cache.clear();
  }

  private cacheKey(input: { flagKey: FeatureFlagKey; userId: string; fallback: boolean }): string {
    return `${input.flagKey}:${input.userId}:${input.fallback ? '1' : '0'}`;
  }

  private getCached(key: string): boolean | null {
    const entry = FeatureFlagService.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      FeatureFlagService.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCached(key: string, value: boolean): void {
    if (FeatureFlagService.cache.size >= FEATURE_FLAG_CACHE_MAX_ENTRIES) {
      const oldestKey = FeatureFlagService.cache.keys().next().value;
      if (oldestKey) FeatureFlagService.cache.delete(oldestKey);
    }
    FeatureFlagService.cache.set(key, {
      value,
      expiresAt: Date.now() + FEATURE_FLAG_CACHE_TTL_MS,
    });
  }

  async isEnabledForUser(input: {
    flagKey: FeatureFlagKey;
    userId: string;
    fallback: boolean;
  }): Promise<boolean> {
    const key = this.cacheKey(input);
    const cached = this.getCached(key);
    if (cached != null) return cached;

    try {
      const result = await withTimeout(
        pool.query<{
          override_enabled: boolean | null;
          flag_enabled: boolean | null;
          rollout_percentage: number | null;
        }>(
          `
          SELECT
            o.enabled AS override_enabled,
            f.enabled AS flag_enabled,
            f.rollout_percentage AS rollout_percentage
          FROM feature_flags f
          LEFT JOIN feature_flag_user_overrides o
            ON o.flag_key = f.flag_key
           AND o.user_id = $2
          WHERE f.flag_key = $1
          LIMIT 1
          `,
          [input.flagKey, input.userId]
        ),
        FEATURE_FLAG_QUERY_TIMEOUT_MS
      );
      const row = result.rows[0];
      if (!row) {
        this.setCached(key, input.fallback);
        return input.fallback;
      }

      if (row.override_enabled != null) {
        const value = !!row.override_enabled;
        this.setCached(key, value);
        return value;
      }

      if (!row.flag_enabled) {
        this.setCached(key, false);
        return false;
      }

      const rollout = Math.max(0, Math.min(100, Number(row.rollout_percentage ?? 0)));
      if (rollout >= 100) {
        this.setCached(key, true);
        return true;
      }
      if (rollout <= 0) {
        this.setCached(key, false);
        return false;
      }

      const value = bucketForUser(input.userId, input.flagKey) < rollout;
      this.setCached(key, value);
      return value;
    } catch (error) {
      logger.warn('Feature flag evaluation failed; using fallback', {
        flagKey: input.flagKey,
        userId: input.userId,
        fallback: input.fallback,
        error: error instanceof Error ? error.message : String(error),
      });
      this.setCached(key, input.fallback);
      return input.fallback;
    }
  }
}
