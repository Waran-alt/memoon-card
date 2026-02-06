# Memoon Card

MemoOn-Card is a flashcards web application that uses a Spaced Repetition System (SRS) algorithm to help users memorize and retain information effectively.

## About

MemoOn-Card provides an intelligent flashcard system that adapts to your learning pace. The SRS algorithm schedules reviews based on your performance, optimizing study sessions for maximum retention with minimal effort.

## 🏗️ Project Structure

```
memoon-card/
├── frontend/              # Frontend application
├── backend/               # Backend API
├── migrations/            # Database migrations (Liquibase)
│   ├── changelog.xml      # Main changelog file
│   └── changesets/        # Individual migration files
├── documentation/         # Project documentation
├── client.config.json     # Portfolio client configuration
├── docker-compose.yml     # Docker Compose configuration
├── .env          # Environment variables template
└── package.json          # Workspace root configuration
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 22.0.0
- Yarn 4.12.0+ (use Corepack: `corepack enable && corepack prepare yarn@4.12.0 --activate`)
- Docker & Docker Compose
- PostgreSQL 17+

### Lockfile (good practice)

The project uses **immutable installs**: the lockfile must not be modified by a normal `yarn install`. This keeps CI and local installs consistent.

- **Install after clone:** run `yarn install` at the repo root (same as CI).
- **If `yarn install` fails** with “lockfile would have been modified”, your local resolution may differ. Run `yarn lockfile:refresh` (requires Docker) and commit the updated `yarn.lock` if you did not change dependencies; otherwise it’s safe to commit after adding/updating deps.
- **After adding or updating dependencies:** run `yarn lockfile:refresh`, then commit `yarn.lock` so CI keeps using the same format.

### Environment

Copy the example env files and set values as needed:

- **Root:** `cp env.example .env` — ports, `NODE_ENV`
- **Backend:** `backend/env.example` → `backend/.env` — JWT, CORS, rate limits
- **Frontend:** `frontend/env.example` → `frontend/.env` — API URL; optional E2E overrides (`E2E_BASE_URL`, `E2E_TEST_PASSWORD`)

See `documentation/ENVIRONMENT_SETUP.md` for auth and E2E variable details. Never commit `.env` files.

### Development Setup

**Standalone:**

```bash
# From repo root
yarn install
# Set up .env (see Environment above)

# Full stack with Docker
docker-compose up -d

# Or run backend and frontend separately
yarn dev:backend   # backend
yarn dev:frontend  # frontend
```

**Integrated with Portfolio:**

```bash
# From Portfolio root
cd /home/waran/dev/Portfolio

# Discover clients (includes memoon-card)
yarn discover:clients

# Run database migrations
yarn migrate:client memoon-card

# Start all services (Portfolio + all clients)
docker-compose up -d
```

### Database Migrations

```bash
# Run migrations (from Portfolio root)
yarn migrate:client memoon-card

# Or using Liquibase directly
cd migrations
liquibase update
```

## 🔧 Tech Stack

- **Frontend:** Next.js 16, TypeScript, Tailwind CSS, Zustand
- **Backend:** Node 22, Express 5, TypeScript, Zod, JWT (access + httpOnly refresh cookie)
- **Database:** PostgreSQL 17, Liquibase migrations
- **SRS:** FSRS v6 (21 weights), optional Python optimizer
- **Testing:** Vitest (unit), Playwright (e2e — see `frontend/e2e/README.md`)

## 📚 Documentation

- **Run the app:** This README (Quick start, Environment, Development setup). First run: **register** → **sign in** → create a **deck** → add **cards** → **study** (see `documentation/QUICK_START.md`).
- **E2E tests:** `frontend/e2e/README.md` — run against a running app; env and same-origin notes.
- **Env reference:** `documentation/ENVIRONMENT_SETUP.md` — auth (JWT, CORS) and E2E variables.
- **Other:** `documentation/` (QUICK_START, SETUP, FSRS optimizer).

## 🔗 Links

- **Repository**: [https://github.com/Waran-alt/memoon-card.git](https://github.com/Waran-alt/memoon-card.git)
- **Portfolio Integration**: Managed as a Git submodule in the Portfolio monorepo
- **Configuration**: See `client.config.json` for Portfolio integration settings

## 📝 License

[To be specified]