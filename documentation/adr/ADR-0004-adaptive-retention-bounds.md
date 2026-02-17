# ADR-0004: Adaptive Retention Bounds

- Status: Accepted
- Date: 2026-02-09

## Context

Adaptive target retention can improve outcomes but can also create unstable behavior under low evidence or noisy windows.

## Decision

Apply bounded, confidence-aware adaptation:

- enforce min/max target bounds from config.
- only allow recommendations when evidence/confidence thresholds are met.
- step changes in small increments.
- gate rollout via DB-backed feature flags with deterministic user segmentation.

## Consequences

- Safer adaptation and easier rollback.
- Slower convergence in some cohorts.
- Requires telemetry comparisons across policy versions and rollout groups.

## Alternatives considered

- Unbounded automatic target tuning:
  - rejected due to risk of oscillation and poor reversibility.
