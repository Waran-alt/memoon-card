# Documentation index

Canonical documentation for MemoOn-Card. If you are new, start with **SETUP.md**.

## Orientation

- **ARCHITECTURE.md** — High-level system map (frontend, API, DB, main flows).
- **SETUP.md** — Contributor setup (Docker-first, migrations, verify).
- **QUICK_START.md** — Shortest path to a running stack.
- **COMMAND_REFERENCE.md** — Root `yarn` scripts.
- **ENVIRONMENT_SETUP.md** — Env vars, precedence, E2E.
- **TROUBLESHOOTING.md** — Common failures and fixes.

## Product and security

- **private/CODEBASE_AUDIT_GRID.md** — Archived security/robustness checklist (dated passes at bottom); copy into documentation/ if you run a new full audit.
- **PAGES_AND_AUTH_REVIEW.md** — Routes, page purpose, access levels.
- **ROLES_AND_ACCESS_CRITIQUE.md** — Role model discussion (`user` / `admin` / `dev`).
- **WEBAPP_SCENARIOS.md** — UX flows mapped to HTTP APIs.

## Backend and frontend development

- **BACKEND.md** — API process, route map, where logic lives.
- **FRONTEND.md** — Next.js structure, i18n, API client.
- **shared/README.md** (repo root) — Shared package; no secrets in `shared/src` (see **private/CODEBASE_AUDIT_GRID.md** section 5).
- **PGADMIN.md** — Optional DB GUI on Docker network.

## FSRS, metrics, and operations

- **FSRS_OPTIMIZER.md** — Python optimizer integration.
- **ADAPTIVE_FEATURE_FLAGS.md** — Feature flags and rollout notes.
- **STUDY_HEALTH_TELEMETRY.md** — Health dashboard streams and alerts.
- **JOURNEY-CONSISTENCY-AUDIT.md** — `review_logs` vs `card_journey_events` alignment.
- **DEPLOYMENT-HOSTINGER.md** — Deployment notes.

## Architecture decisions (ADR)

See **adr/README.md** for the ADR index.

## Private / archived

**private/README.md** — Working notes, archived audit grid (**private/CODEBASE_AUDIT_GRID.md**), performance profiling. Not required for first-time setup.

## Quality gates (repo root)

```bash
yarn check    # type-check + lint
yarn test     # frontend + backend unit tests
```

The root **README.md** describes repository layout and external links.
