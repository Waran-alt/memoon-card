# Adaptive Feature Flags

This document describes the feature-flag framework used to roll out adaptive policies safely.

## File Purpose

Use this file as the operator playbook for:

- what the adaptive feature flags control,
- how users are segmented,
- and exactly how to ramp or roll back safely.

## Purpose

- Control exposure of adaptive behavior without deploy changes.
- Support deterministic user segmentation (`0%` to `100%` rollout).
- Allow explicit per-user overrides for testing and incident rollback.
- Fall back safely if flag storage is unavailable.

## Data Model

- `feature_flags`
  - `flag_key` (PK)
  - `enabled` (master switch)
  - `rollout_percentage` (`0..100`)
  - metadata (`description`, timestamps)
- `feature_flag_user_overrides`
  - `(flag_key, user_id)` unique pair
  - explicit `enabled` override
  - optional `reason`, timestamps

## Related Files (and why they exist)

- `backend/src/services/feature-flag.service.ts` - evaluates flags per user with cache, timeout, and fallback behavior.
- `backend/src/services/adaptive-retention.service.ts` - gates adaptive retention policy by flag evaluation.
- `migrations/changesets/018-feature-flag-framework.xml` - schema and seed rows for flags and overrides.
- `backend/src/__tests__/services/feature-flag.service.test.ts` - validates segmentation, cache behavior, and fail-safe fallback.

Seeded flags:

- `adaptive_retention_policy`
- `short_term_learning`

Both are intentionally seeded at `enabled=false`, `rollout_percentage=0` for safe startup.

## Evaluation Order

1. user override (if present)
2. global flag row (`enabled` + rollout bucket)
3. fallback value from existing env behavior

Rollout uses deterministic bucketing based on `sha256(flag_key:user_id) % 100`.

## Safe Default Behavior

If flag queries fail (e.g., table unavailable), services use fallback values (e.g. adaptive retention: `ADAPTIVE_RETENTION_ENABLED`). This ensures no hard dependency on flag infrastructure for runtime safety.

## Operator Rollout Checklist

Use this sequence when enabling adaptive features:

1. keep global rollout at `0%`
2. add internal per-user overrides for canary testing
3. verify dashboard + alert metrics
4. ramp globally: `5% -> 20% -> 50% -> 100%`
5. remove temporary user overrides

## SQL Snippets

Enable canary for one user:

```sql
INSERT INTO feature_flag_user_overrides (flag_key, user_id, enabled, reason)
VALUES ('adaptive_retention_policy', '<user-uuid>', true, 'canary')
ON CONFLICT (flag_key, user_id)
DO UPDATE SET enabled = EXCLUDED.enabled, reason = EXCLUDED.reason, updated_at = NOW();
```

Set global ramp:

```sql
UPDATE feature_flags
SET enabled = true,
    rollout_percentage = 20,
    updated_at = NOW()
WHERE flag_key = 'adaptive_retention_policy';
```

Emergency rollback:

```sql
UPDATE feature_flags
SET enabled = false,
    rollout_percentage = 0,
    updated_at = NOW()
WHERE flag_key IN ('adaptive_retention_policy', 'short_term_learning');
```
