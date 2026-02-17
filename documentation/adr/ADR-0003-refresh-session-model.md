# ADR-0003: Refresh Session Model

- Status: Accepted
- Date: 2026-02-09

## Context

Stateless refresh tokens cannot reliably support rotation/reuse detection and revocation workflows required for secure long-lived sessions.

## Decision

Adopt stateful refresh sessions:

- refresh tokens are stored/validated via `refresh_token_sessions`.
- refresh flow rotates tokens and tracks replacement chain.
- reuse detection revokes compromised session lineage.
- refresh token ingestion is cookie-only on backend routes.

## Consequences

- Stronger compromise containment and auditability.
- More DB dependency in auth path.
- Explicit operational runbooks are needed for incident handling.

## Alternatives considered

- Stateless refresh JWT only:
  - rejected because replay/reuse detection and revocation are weak/non-immediate.
