# Code Ownership Map

This map defines ownership for critical modules to speed up reviews and incident routing.

## Ownership Model

- `Primary owner`: first responder for design and incidents.
- `Secondary owner`: backup reviewer and escalation contact.
- `Domain oncall`: operational owner for production-impacting events.

## Critical Module Ownership

| Module / Path | Primary owner | Secondary owner | Domain oncall | Notes |
| --- | --- | --- | --- | --- |
| Auth routes and token lifecycle (`backend/src/routes/auth.routes.ts`, `backend/src/services/refresh-token.service.ts`) | Backend Security | Backend Platform | Auth oncall | Refresh rotation/reuse and cookie security |
| Study ingestion and journey (`backend/src/services/study-events.service.ts`, `backend/src/services/card-journey.service.ts`) | Learning Platform | Backend Platform | Study oncall | Idempotent write path and consistency checks |
| Adaptive policy engines (`backend/src/services/adaptive-retention.service.ts`) | FSRS/Algorithm | Learning Platform | Study oncall | Rollout guarded by feature flags |
| Feature flags and rollout infra (`backend/src/services/feature-flag.service.ts`, DB `feature_flags*`) | Backend Platform | Backend Security | Platform oncall | Controls adaptive exposure and rollback |
| Study/auth observability (`backend/src/services/study-health-dashboard.service.ts`, `backend/src/services/study-health-alerts.service.ts`) | Platform Observability | Learning Platform | Platform oncall | Health dashboards and anomaly alerts |
| Migrations (`migrations/`) | Backend Platform | DB Reliability | Platform oncall | Liquibase schema safety and rollback prep |
| Frontend study surfaces (`frontend/src/app/[locale]/(protected)/app/study-*`) | Frontend App | Learning Platform | Product oncall | Session UX and telemetry visibility |

## Review Routing Rules

- Changes touching two or more critical domains require both corresponding primary owners.
- Security-affecting auth changes always require Backend Security review.
- Migration changes always require Backend Platform review.
