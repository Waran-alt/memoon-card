/**
 * Feature flags and per-user overrides (admin_action_audit on mutating calls). Used from `/api/dev` with requireDev, not from public routes.
 */
import { pool } from '@/config/database';

export interface AdminFeatureFlagRow {
  flagKey: string;
  enabled: boolean;
  rolloutPercentage: number;
  description: string | null;
  updatedAt: string;
  overrideCount: number;
}

export interface AdminFeatureFlagOverrideRow {
  userId: string;
  enabled: boolean;
  reason: string | null;
  updatedAt: string;
}

export class AdminFeatureFlagsService {
  private async audit(adminUserId: string, input: {
    action: string;
    targetType: string;
    targetId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await pool.query(
      `
      INSERT INTO admin_action_audit (admin_user_id, action, target_type, target_id, payload_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [adminUserId, input.action, input.targetType, input.targetId ?? null, JSON.stringify(input.payload ?? {})]
    );
  }

  async listFlags(): Promise<AdminFeatureFlagRow[]> {
    const result = await pool.query(
      `
      SELECT
        f.flag_key::text AS flag_key,
        f.enabled,
        f.rollout_percentage::int AS rollout_percentage,
        f.description,
        f.updated_at,
        COUNT(o.id)::int AS override_count
      FROM feature_flags f
      LEFT JOIN feature_flag_user_overrides o
        ON o.flag_key = f.flag_key
      GROUP BY f.flag_key, f.enabled, f.rollout_percentage, f.description, f.updated_at
      ORDER BY f.flag_key ASC
      `
    );
    return result.rows.map((row) => ({
      flagKey: String(row.flag_key),
      enabled: !!row.enabled,
      rolloutPercentage: Number(row.rollout_percentage ?? 0),
      description: row.description == null ? null : String(row.description),
      updatedAt: new Date(row.updated_at).toISOString(),
      overrideCount: Number(row.override_count ?? 0),
    }));
  }

  async updateFlag(
    adminUserId: string,
    flagKey: string,
    patch: { enabled: boolean; rolloutPercentage: number; description?: string | null }
  ): Promise<AdminFeatureFlagRow | null> {
    const result = await pool.query(
      `
      UPDATE feature_flags
      SET enabled = $2,
          rollout_percentage = $3,
          description = $4,
          updated_at = NOW()
      WHERE flag_key = $1
      RETURNING flag_key::text AS flag_key, enabled, rollout_percentage::int AS rollout_percentage, description, updated_at
      `,
      [flagKey, patch.enabled, patch.rolloutPercentage, patch.description ?? null]
    );
    const row = result.rows[0];
    if (!row) return null;

    await this.audit(adminUserId, {
      action: 'feature_flag_update',
      targetType: 'feature_flag',
      targetId: flagKey,
      payload: {
        enabled: patch.enabled,
        rolloutPercentage: patch.rolloutPercentage,
        description: patch.description ?? null,
      },
    });

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS override_count FROM feature_flag_user_overrides WHERE flag_key = $1',
      [flagKey]
    );
    return {
      flagKey: String(row.flag_key),
      enabled: !!row.enabled,
      rolloutPercentage: Number(row.rollout_percentage ?? 0),
      description: row.description == null ? null : String(row.description),
      updatedAt: new Date(row.updated_at).toISOString(),
      overrideCount: Number(countResult.rows[0]?.override_count ?? 0),
    };
  }

  async upsertOverride(
    adminUserId: string,
    flagKey: string,
    userId: string,
    input: { enabled: boolean; reason?: string | null }
  ): Promise<AdminFeatureFlagOverrideRow> {
    const result = await pool.query(
      `
      INSERT INTO feature_flag_user_overrides (flag_key, user_id, enabled, reason, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (flag_key, user_id)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        reason = EXCLUDED.reason,
        updated_at = NOW()
      RETURNING user_id::text AS user_id, enabled, reason, updated_at
      `,
      [flagKey, userId, input.enabled, input.reason ?? null]
    );
    const row = result.rows[0];
    await this.audit(adminUserId, {
      action: 'feature_flag_override_upsert',
      targetType: 'feature_flag_override',
      targetId: `${flagKey}:${userId}`,
      payload: {
        enabled: input.enabled,
        reason: input.reason ?? null,
      },
    });
    return {
      userId: String(row.user_id),
      enabled: !!row.enabled,
      reason: row.reason == null ? null : String(row.reason),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async deleteOverride(adminUserId: string, flagKey: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM feature_flag_user_overrides
      WHERE flag_key = $1
        AND user_id = $2
      RETURNING id
      `,
      [flagKey, userId]
    );
    const deleted = result.rows.length > 0;
    if (deleted) {
      await this.audit(adminUserId, {
        action: 'feature_flag_override_delete',
        targetType: 'feature_flag_override',
        targetId: `${flagKey}:${userId}`,
      });
    }
    return deleted;
  }

  async listOverrides(flagKey: string, limit = 50): Promise<AdminFeatureFlagOverrideRow[]> {
    const normalizedLimit = Math.max(1, Math.min(200, limit));
    const result = await pool.query(
      `
      SELECT user_id::text AS user_id, enabled, reason, updated_at
      FROM feature_flag_user_overrides
      WHERE flag_key = $1
      ORDER BY updated_at DESC
      LIMIT $2
      `,
      [flagKey, normalizedLimit]
    );
    return result.rows.map((row) => ({
      userId: String(row.user_id),
      enabled: !!row.enabled,
      reason: row.reason == null ? null : String(row.reason),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }
}
