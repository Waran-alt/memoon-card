# Adaptive Feature Flags

This document describes the feature-flag framework used to roll out adaptive policies safely.

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

Seeded flags:

- `adaptive_retention_policy`
- `day1_short_loop_policy`

## Evaluation Order

1. user override (if present)
2. global flag row (`enabled` + rollout bucket)
3. fallback value from existing env behavior

Rollout uses deterministic bucketing based on `sha256(flag_key:user_id) % 100`.

## Safe Default Behavior

If flag queries fail (e.g., table unavailable), services use fallback values:

- adaptive retention: `ADAPTIVE_RETENTION_ENABLED`
- day-1 short loop: `DAY1_SHORT_LOOP_ENABLED`

This ensures no hard dependency on flag infrastructure for runtime safety.
