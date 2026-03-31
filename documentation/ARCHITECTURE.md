# Architecture overview

MemoOn-Card is a **monorepo** (security/ops checklist: `documentation/private/CODEBASE_AUDIT_GRID.md`): Next.js frontend, Express API, PostgreSQL, and Liquibase migrations. Shared npm package `@memoon-card/shared` holds cross-cutting constants used by backend (and optionally frontend).

## Runtime diagram

```text
Browser ──► Next.js (App Router, locale prefix /en|/fr)
              │
              ├── Server components / RSC: auth via cookies, `getSession`
              └── Client: Zustand auth store, Axios `apiClient` → backend

Backend Express (/api/*)
  ├── JWT access header + httpOnly refresh cookie
  ├── CSRF: `X-Requested-With` on mutating methods
  └── `pg` pool → PostgreSQL

PostgreSQL
  └── Schema owned by Liquibase (`migrations/changelog.xml`)
```

## Data flow: study and scheduling

1. User studies a deck in the UI (`/app/decks/[id]/study`).
2. Each rating calls **`POST /api/cards/:id/review`** (or batch review where applicable).
3. **`ReviewService.logReview`** updates card FSRS state, inserts **`review_logs`**, and appends **`card_journey_events`** (`rating_submitted`, etc.) with idempotent keys.
4. There is **no** server-side “study session” entity; timing (e.g. thinking duration) is sent with the review payload.

For consistency checks between `review_logs` and journey rows, see [JOURNEY-CONSISTENCY-AUDIT.md](./JOURNEY-CONSISTENCY-AUDIT.md).

## Where to look in code

| Concern | Location |
|---------|----------|
| HTTP entry, middleware order, route mounting | `backend/src/index.ts` |
| REST handlers by domain | `backend/src/routes/*.routes.ts` |
| Zod request validation | `backend/src/schemas/*.ts` |
| DB types (mirror of migrations) | `backend/src/types/database.ts` |
| FSRS scheduling | `backend/src/services/fsrs.service.ts`, `review.service.ts` |
| Next app shell and nav | `frontend/src/components/AppLayoutShell.tsx` |
| Authenticated area | `frontend/src/app/[locale]/(protected)/app/` |
| API client + refresh | `frontend/src/lib/api.ts` |

## Migrations

All schema changes go through **Liquibase** under `migrations/changesets/`. The TypeScript types and SQL live in different layers; after schema changes, update `backend/src/types/database.ts` and any affected Zod schemas.
