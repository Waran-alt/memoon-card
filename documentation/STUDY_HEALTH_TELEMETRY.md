# Study Health Telemetry

This document describes the operational telemetry used for study/auth health monitoring.

## Endpoints

- `GET /api/study/health-dashboard`: aggregated health metrics and trends.
- `GET /api/study/health-alerts`: rule-based anomaly alerts (warning/critical).

## Telemetry Streams

- `study_events`: client-side study activity stream.
- `card_journey_events`: immutable card lifecycle and study journey events.
- `user_operational_events`: auth refresh and study API operational metrics.

## Policy Version Tagging

Telemetry now includes `policy_version` to compare behavior across policy rollouts.

- Source field: `policy_version` column in all three telemetry tables.
- Payload mirror: event payload JSON includes `policyVersion` for downstream tools.
- Default value:
  - from env `ADAPTIVE_POLICY_VERSION` when set and valid
  - fallback to `baseline-v1`

Accepted format: `^[a-zA-Z0-9._-]{1,64}$`

## Current Alert Rules

- `journey_mismatch_rate` (critical): mismatch rate at or above major threshold.
- `refresh_failure_rate` (warning): refresh failure rate above baseline with minimum sample size.
- `refresh_reuse_detected` (critical): refresh reuse/replay detected.
- `study_api_p95_latency` (warning): p95 study API latency breach.
