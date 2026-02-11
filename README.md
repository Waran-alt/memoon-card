# Memoon Card

MemoOn-Card is a flashcards web application that uses a Spaced Repetition System (SRS) algorithm to help users memorize and retain information effectively.

## About

MemoOn-Card provides an intelligent flashcard system that adapts to your learning pace. The SRS algorithm schedules reviews based on your performance, optimizing study sessions for maximum retention with minimal effort.

## 🏗️ Project Structure

```
memoon-card/
├── frontend/              # Frontend application
├── backend/               # Backend API
├── shared/                # Shared package (validation constants)
├── migrations/            # Database migrations (Liquibase)
│   ├── changelog.xml      # Main changelog file
│   └── changesets/        # Individual migration files
├── documentation/         # Project documentation
├── docker-compose.yml     # Docker Compose configuration
├── .env                   # Environment variables template
└── package.json          # Root configuration
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
- **Frontend:** `frontend/env.example` → `frontend/.env` — API URL; optional E2E credentials (`E2E_TEST_PASSWORD`, `E2E_TEST_EMAIL`)

See `documentation/ENVIRONMENT_SETUP.md` for auth and E2E variable details. Never commit `.env` files.

### Development Setup

**Standalone:**

```bash
# From repo root
yarn install
# Set up .env (see Environment above)

# Full stack with Docker
yarn docker:up

# Or run backend and frontend separately
yarn dev:backend   # backend
yarn dev:frontend  # frontend
```

### Database Migrations

```bash
# Run migrations using project script
yarn migrate:up

# Or using Liquibase directly
cd migrations
liquibase --changeLogFile=changelog.xml update
```

## 🔧 Tech Stack

- **Frontend:** Next.js 16, TypeScript, Tailwind CSS, Zustand
- **Backend:** Node 22, Express 5, TypeScript, Zod, JWT (access + httpOnly refresh cookie)
- **Database:** PostgreSQL 17, Liquibase migrations
- **SRS:** FSRS v6 (21 weights), optional Python optimizer
- **Testing:** Vitest (unit tests)

E2E smoke tests (Playwright) are available via `yarn test:e2e` after installing browsers (`yarn test:e2e:install`).

## 📚 Documentation

Documentation is centralized in `documentation/`.

- **Docs index:** `documentation/README.md`
- **Quick start:** `documentation/QUICK_START.md`
- **Setup (canonical onboarding path):** `documentation/SETUP.md`
- **Environment:** `documentation/ENVIRONMENT_SETUP.md`
- **Command reference:** `documentation/COMMAND_REFERENCE.md`
- **Troubleshooting matrix:** `documentation/TROUBLESHOOTING.md`
- **Backend guide:** `documentation/BACKEND.md`
- **Frontend guide:** `documentation/FRONTEND.md`
- **FSRS optimizer:** `documentation/FSRS_OPTIMIZER.md`

## 🔗 Links

- **Repository**: [https://github.com/Waran-alt/memoon-card.git](https://github.com/Waran-alt/memoon-card.git)

## 📝 License

[To be specified]