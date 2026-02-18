# Documentation Index

This folder is the source of truth for project documentation.

## How to read this folder

- Use `README.md` files as entry points.
- Open domain docs first (`BACKEND.md`, `FRONTEND.md`, feature docs), then ADRs.
- Treat files in `private/` as internal planning notes, not product documentation.

## Start Here

- `SETUP.md` - canonical contributor setup path
- `QUICK_START.md` - shortest path to run and use the app
- `ENVIRONMENT_SETUP.md` - environment variables and examples
- `COMMAND_REFERENCE.md` - root script and workflow command map
- `TROUBLESHOOTING.md` - symptom-driven troubleshooting matrix
- `PGADMIN.md` - connecting pgAdmin (or other Docker DB clients) to Postgres via shared network

## Feature / Domain Docs

- `BACKEND.md` - backend-focused development notes
- `FRONTEND.md` - frontend-focused development notes
- `FSRS_OPTIMIZER.md` - FSRS optimizer integration details
- `ADAPTIVE_FEATURE_FLAGS.md` - DB-backed rollout flags with user segmentation and safe fallbacks
- `CODE_OWNERSHIP_MAP.md` - ownership and review routing for critical modules
- `WEBAPP_SCENARIOS.md` - user UX journeys mapped to API calls (implemented + theorized)
- `STUDY_HEALTH_TELEMETRY.md` - study/auth health telemetry model, alert rules, and policy-version tagging
- `perf/JOURNEY_CONSISTENCY_EXPLAIN_2026Q1.md` - consistency-report query profiling snapshots, index policy, and retention guidance

## Architecture Decisions

- `adr/README.md` - index and ADR writing template
- `adr/ADR-0001-event-model-separation.md`
- `adr/ADR-0002-idempotency-strategy.md`
- `adr/ADR-0003-refresh-session-model.md`
- `adr/ADR-0004-adaptive-retention-bounds.md`

## Recently Added File Purposes

- `ADAPTIVE_FEATURE_FLAGS.md` - rollout model, safety defaults, and SQL runbook for enabling/disabling adaptive flags.
- `STUDY_HEALTH_TELEMETRY.md` - telemetry sources, policy tagging, and alert semantics for health monitoring.
- `CODE_OWNERSHIP_MAP.md` - ownership routing for reviews/incidents on critical modules.

## Internal / Private Notes

Non-production planning docs (roadmaps, analysis, internal plans) are stored in:

- `private/README.md`

## Convention

- Keep production-facing docs in `documentation/`.
- Keep non-production/internal docs in `private/`.
- Keep at most one `README.md` per folder.
- `README.md` files outside this folder should be short entry points that link here.
