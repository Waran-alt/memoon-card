# Documentation Index

Source of truth for project documentation. Internal planning lives in `private/` (see `private/README.md`).

## Start here

- **SETUP.md** – contributor setup (Docker-first)
- **QUICK_START.md** – shortest path to run the app
- **ENVIRONMENT_SETUP.md** – env vars and examples
- **COMMAND_REFERENCE.md** – root scripts
- **TROUBLESHOOTING.md** – symptom → fix
- **PGADMIN.md** – connect pgAdmin to Postgres (shared network)

## Feature / domain

- **BACKEND.md**, **FRONTEND.md** – dev notes
- **PAGES_AND_AUTH_REVIEW.md** – pages, purpose, and auth access (public vs authenticated vs admin)
- **ROLES_AND_ACCESS_CRITIQUE.md** – critique of adding guest/moderator/dev roles; what should be accessible to whom
- **TRANSLATION_REVIEW_NEW_USER.md** – translation review from a new user POV (e.g. “Santé étude” → clearer wording)
- **FSRS_OPTIMIZER.md** – optimizer integration
- **ADAPTIVE_FEATURE_FLAGS.md** – rollout flags and SQL runbook
- **CODE_OWNERSHIP_MAP.md** – ownership and review routing
- **WEBAPP_SCENARIOS.md** – UX → API mapping
- **STUDY_HEALTH_TELEMETRY.md** – health telemetry and alerts
- **perf/JOURNEY_CONSISTENCY_EXPLAIN_2026Q1.md** – consistency query profiling

## Architecture decisions

- **adr/README.md** – index and template
- **adr/ADR-0001** … **ADR-0004** – event model, idempotency, refresh session, adaptive retention
