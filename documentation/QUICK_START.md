# Quick start

Get the app running and use it in a few minutes.

## Prerequisites

- Node.js >= 22.0.0  
- Yarn 4.9.2+ (e.g. `corepack enable && corepack prepare yarn@4.12.0 --activate`)  
- Docker & Docker Compose (for DB and optional full stack)  
- PostgreSQL 17+ (or use Docker)

## 1. Install and env

```bash
# From repo root
yarn install

# Environment: copy examples and set values (see documentation/ENVIRONMENT_SETUP.md)
cp env.example .env
cp backend/env.example backend/.env
cp frontend/env.example frontend/.env
# Edit backend/.env (JWT_SECRET, CORS_ORIGIN) and frontend/.env (NEXT_PUBLIC_API_URL) as needed
```

## 2. Database and migrations

```bash
# Start Postgres (standalone)
docker-compose up -d postgres

# Run migrations (from Portfolio root if integrated, or use project migrate script)
yarn migrate:up
# Or from Portfolio root: yarn migrate:client memoon-card
```

## 3. Run the app

**Standalone:**

```bash
yarn dev:backend   # backend on BACKEND_PORT (e.g. 4002)
yarn dev:frontend  # frontend on FRONTEND_PORT (e.g. 3002)
```

**With Docker:**

```bash
docker-compose up -d
```

Open the frontend (e.g. `http://localhost:3002` or `https://memoon-card.localhost`).

## 4. Use the app

The flow is straightforward:

1. **Register** – Create account (email + password).
2. **Sign in** – Log in with those credentials.
3. **My decks** – Create a deck (title, optional description).
4. **Deck detail** – Open a deck, add **cards** (front/back, optional comment).
5. **Study** – Start a session, see cards, rate (Again / Hard / Good / Easy); session ends when the queue is empty.

No separate user guide is needed; the UI is self-explanatory.

## 5. E2E tests (optional)

Playwright tests run against a **running** app (frontend + backend).  
Same-origin setup (e.g. `https://memoon-card.localhost` with `NEXT_PUBLIC_API_URL=""`) is recommended so cookies work.

- **Run:** `yarn test:e2e` (from root or `frontend`). Optionally set `E2E_BASE_URL` and `E2E_TEST_PASSWORD` (see `frontend/env.example`).
- **Details:** `frontend/e2e/README.md` — setup, same-origin, CORS, and what’s covered (auth, login, study flows).

## Next

- **Docs:** `documentation/ENVIRONMENT_SETUP.md`, `documentation/SETUP.md`, `documentation/FSRS_OPTIMIZER.md`
- **README:** Project structure, lockfile, tech stack, and links at repo root `README.md`
