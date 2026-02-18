# Setup Guide

This is the canonical contributor onboarding path for MemoOn-Card.

For the full documentation map, see `documentation/README.md`.

## Prerequisites

- Node.js >= 22.0.0
- Yarn 4.12.0+ (`corepack enable && corepack prepare yarn@4.12.0 --activate`)
- Docker Desktop / Docker Engine + Docker Compose
- Git

## Canonical Setup Path (Docker-First)

### 1) Install dependencies

```bash
yarn install
```

### 2) Create environment files

```bash
cp env.example .env
cp backend/env.example backend/.env
cp frontend/env.example frontend/.env
```

Required edits before first run:

- `backend/.env`: set at least `JWT_SECRET`, `CORS_ORIGIN` (or `CORS_ORIGINS`)
- `frontend/.env`: set `NEXT_PUBLIC_API_URL` if not using defaults

See `documentation/ENVIRONMENT_SETUP.md` for precedence and variable details.

### 3) Start the stack

```bash
yarn docker:up
```

Default host ports:

- Frontend: `3002`
- Backend: `4002`
- Postgres: `5433` (container internal: `5432`)

### 4) Run migrations

```bash
# if using local Liquibase
yarn migrate:up

# if using Docker Liquibase image
yarn migrate:docker
```

### 5) Verify services

```bash
curl -f http://localhost:4002/health
curl -f http://localhost:3002/en
```

## Local (Non-Docker) App Runtime

Use this only when you intentionally want backend/frontend running on host instead of containers.

```bash
# terminal 1: database only
yarn postgres

# terminal 2: backend
yarn dev:backend

# terminal 3: frontend
yarn dev:frontend
```

For this mode, ensure local runtime values in `backend/.env` and `frontend/.env` are correct (for example DB host/port and API URL).

## Optional: pgAdmin

See **`documentation/PGADMIN.md`**. In short: create `db-admin-net`, start Postgres, run pgAdmin on that network, then in pgAdmin use Host **postgres**, Port **5432**.

## Optional: E2E Smoke Test

```bash
yarn test:e2e:install
yarn test:e2e
```

The app must be reachable at `PLAYWRIGHT_BASE_URL` (default `http://localhost:3002`).

## Command and Incident References

- Full command list: `documentation/COMMAND_REFERENCE.md`
- Symptom-based fixes: `documentation/TROUBLESHOOTING.md`

## Common Next Actions

- Check quality gates: `yarn check && yarn test`
- Rebuild containers after dependency changes: `yarn docker:build && yarn docker:up`
- Follow feature-specific guides:
  - `documentation/BACKEND.md`
  - `documentation/FRONTEND.md`
  - `documentation/FSRS_OPTIMIZER.md`
