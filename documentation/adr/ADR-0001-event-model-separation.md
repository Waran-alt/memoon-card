# ADR-0001: Event Model Separation

- Status: Accepted
- Date: 2026-02-09

## Context

The system captures:

- raw client-side study interactions,
- immutable card journey history,
- and operational auth/API telemetry.

Each stream serves a different consumer and has different retention and query patterns.

## Decision

Keep these streams as separate models/tables:

- `study_events` for client action ingestion and replay/debug.
- `card_journey_events` for immutable, user-facing timeline and consistency checks.
- `user_operational_events` for service health/latency/auth telemetry.

Cross-stream analysis happens in read-model services (`study-health-dashboard`, consistency reports), not by collapsing the source-of-truth schemas.

## Consequences

- Clear ownership and schema evolution by concern.
- Better performance tuning per workload.
- Slightly higher complexity in aggregation services.

## Alternatives considered

- Single unified event log:
  - rejected due to mixed cardinality/query needs and fragile coupling across consumers.
