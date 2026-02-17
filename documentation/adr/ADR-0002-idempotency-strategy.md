# ADR-0002: Idempotency Strategy

- Status: Accepted
- Date: 2026-02-09

## Context

Study and journey writes are vulnerable to duplicate delivery from retries, network instability, and client replays.

## Decision

Use deterministic idempotency keys and database-enforced uniqueness:

- `study_events`: unique key `(user_id, client_event_id)` with deterministic UUID fallback when absent.
- `card_journey_events`: unique key `(user_id, idempotency_key)`, usually derived from source event ID.

Writers use `ON CONFLICT ... DO NOTHING` to guarantee safe retries.

## Consequences

- At-least-once transport semantics are safe.
- Duplicate logical events do not multiply downstream state.
- Requires careful key design and propagation between services.

## Alternatives considered

- In-memory dedupe cache:
  - rejected as non-durable and vulnerable to process restarts.
