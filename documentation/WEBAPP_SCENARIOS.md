# Webapp User Scenarios

This document maps user-facing UX flows to backend API calls.

- **Implemented** means endpoints and behavior exist in current backend.
- **Theorized** means expected UX/API orchestration for planned features.

## Assumptions

- Frontend runs at `http://localhost:3002`.
- Backend API base is `http://localhost:4002/api`.
- Protected routes require auth (bearer token/session) and CSRF protection for state-changing calls.

## Scenario 1: New user onboarding (Implemented)

### UX interaction

1. User opens app and selects register or login.
2. User enters credentials.
3. App lands user on authenticated area (decks/dashboard).

### API calls

1. `POST /api/auth/register` or `POST /api/auth/login`
2. Optional session bootstrap: `GET /api/auth/session`
3. Token refresh over time: `POST /api/auth/refresh`
4. Logout: `POST /api/auth/logout`

## Scenario 2: Create and organize deck content (Implemented)

### UX interaction

1. User creates a deck.
2. User adds cards to deck.
3. User edits or deletes decks/cards.
4. User checks deck stats and card lists.

### API calls

- Decks:
  - `GET /api/decks`
  - `POST /api/decks`
  - `GET /api/decks/:id`
  - `PUT /api/decks/:id`
  - `DELETE /api/decks/:id`
  - `GET /api/decks/:id/stats`
- Cards in deck:
  - `GET /api/decks/:id/cards`
  - `POST /api/decks/:id/cards`
  - `GET /api/decks/:id/cards/due`
  - `GET /api/decks/:id/cards/new?limit=...`
- Single card management:
  - `GET /api/cards/:id`
  - `PUT /api/cards/:id`
  - `DELETE /api/cards/:id`

## Scenario 3: Study session and card review (Implemented)

### UX interaction

1. User starts study for a deck.
2. For each card:
   - user sees front (`recto`)
   - clicks "Show answer"
   - rates recall (Again/Hard/Good/Easy)
3. Session summary shown when queue ends.

### API calls

1. Initial load:
   - `GET /api/decks/:id`
   - `GET /api/decks/:id/cards/due`
   - `GET /api/decks/:id/cards/new?limit=...`
2. Per-card review:
   - `POST /api/cards/:id/review` with:
     - `rating`
     - `shownAt` (optional, now used)
     - `revealedAt` (optional, now used)
     - `sessionId` (optional, now used)

### UX/FSRS notes

- Review updates FSRS state immediately.
- Review log persists timing metadata for analytics/session grouping.

## Scenario 4: Manage reviewed/edited card impact (Implemented)

### UX interaction

1. User manages cards after seeing answers outside recall mode.
2. User chooses one of:
   - postpone next review (expand delay)
   - reset stability (treat as new)

### API calls

- Postpone/penalty:
  - `POST /api/cards/:id/postpone`
  - body supports `revealedForSeconds` (defaults to 30 if omitted)
- Reset:
  - `POST /api/cards/:id/reset-stability`

### UX/FSRS notes

- Postpone applies management penalty (pushes `next_review` forward).
- Reset clears stability/difficulty and makes card due immediately.

## Scenario 5: Optimize FSRS weights (Implemented)

### UX interaction

1. User checks optimization readiness.
2. User runs optimization when eligible.
3. App confirms weights update.

### API calls

1. `GET /api/optimization/status`
2. `POST /api/optimization/optimize`
3. Optional manual workflow:
   - `GET /api/optimization/export`

## Scenario 6: Inspect metrics and calibration quality (Implemented)

### UX interaction

1. User/admin opens optimization metrics panel.
2. User inspects daily trends, sessions, and rolling windows.
3. User triggers manual refresh if needed.

### API calls

- `GET /api/optimization/metrics/daily?days=...`
- `GET /api/optimization/metrics/summary?days=...`
- `GET /api/optimization/metrics/sessions?days=...`
- `GET /api/optimization/metrics/windows`
- `POST /api/optimization/metrics/refresh` with optional `{ "days": N }`

## Scenario 7: Weight snapshot history and rollback (Implemented)

### UX interaction

1. User/admin opens optimization history.
2. User compares versions and selects rollback target.
3. User optionally enters rollback reason.
4. App activates selected snapshot.

### API calls

1. `GET /api/optimization/snapshots?limit=...`
2. `POST /api/optimization/snapshots/:version/activate`
   - optional body: `{ "reason": "..." }`

### UX/FSRS notes

- Activation is transactional:
  - previous active snapshot is deactivated
  - selected snapshot becomes active
  - `user_settings` is restored from selected snapshot
- Audit fields are persisted:
  - `activated_by`
  - `activated_at`
  - `activation_reason`

## Scenario 8: Fast multi-card grading (Implemented backend, limited UX use)

### UX interaction

- Useful for advanced UX modes (keyboard cram, review inbox bulk submit).

### API calls

- `POST /api/reviews/batch` with `reviews: [{ cardId, rating }, ...]`

## Scenario 9: Theorized adaptive scheduling UX (Not implemented yet)

### Theorized UX interaction

1. App shows "study now / later" guidance based on predicted retention and workload.
2. App proposes dynamic session size and priority set.
3. App warns when fatigue is detected mid-session.
4. App may suggest rollback if post-optimization calibration degrades.

### Theorized API orchestration

- Read-only signals from existing endpoints:
  - `GET /api/optimization/status`
  - `GET /api/optimization/metrics/summary`
  - `GET /api/optimization/metrics/windows`
  - `GET /api/optimization/snapshots`
- State-changing actions:
  - `POST /api/optimization/optimize`
  - `POST /api/optimization/snapshots/:version/activate`

### Potential new APIs (future)

- Per-user adaptive target retention policy endpoint.
- Recommendation endpoint for "next best cards" by risk/time budget.
- Guardrail endpoint returning go/no-go for newly optimized weights.
