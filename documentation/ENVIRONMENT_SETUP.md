# Environment setup

Create `.env` files from the examples below. **Never commit `.env` files.**

## Overview

| Where | File | Purpose |
|-------|------|--------|
| Root | `.env` | Source of truth for Docker Compose values and shared runtime defaults. |
| Backend | `backend/.env` | Backend-specific config: JWT, CORS, rate limiting, database connection for local runs. |
| Frontend | `frontend/.env` | API URL for the browser; optional E2E overrides when running Playwright. |

## Root (`.env`)

Copy from `env.example`:

```bash
cp env.example .env
```

Variables:

- **NODE_ENV** – `development` or `production`
- **FRONTEND_PORT** – Port the frontend listens on (e.g. `3002`)
- **BACKEND_PORT** – Port the backend listens on (e.g. `4002`)
- **POSTGRES_PORT** – Host-exposed Postgres port (default `5433`)
- **POSTGRES_HOST_DOCKER** – Backend-to-Postgres host inside Docker network (default `postgres`)
- **POSTGRES_PORT_DOCKER** – Backend-to-Postgres port inside Docker network (default `5432`)
- **BACKEND_URL_DOCKER** – Frontend container URL for backend service (default `http://memoon-card-backend:4002`)

Docker Compose and scripts read this file. Service-specific config lives in backend/frontend `.env`.

Runtime precedence is:
1. Container/runtime environment (Docker Compose `environment`, CI, shell exports)
2. `backend/.env` or `frontend/.env`
3. Root `.env`

## Backend (`backend/.env`)

Copy from `backend/env.example`:

```bash
cp backend/env.example backend/.env
```

### Auth (JWT)

- **JWT_SECRET** – Secret for signing tokens (min 32 characters). **Change in production.**
- **JWT_ACCESS_EXPIRES_IN** – Access token TTL (e.g. `15m`)
- **JWT_REFRESH_EXPIRES_IN** – Refresh token TTL (e.g. `7d`); must match cookie `maxAge` used by the app.

### CORS

- **CORS_ORIGIN** – Allowed origin for browser requests (e.g. `http://localhost:3002` or `https://memoon-card.localhost`)
- **CORS_ORIGINS** – Optional; comma-separated list if you need multiple origins.

Backend must allow the frontend origin you use (localhost or `https://memoon-card.localhost`), or login/register will fail with CORS errors.

### Rate limiting

- **RATE_LIMIT_WINDOW_MS** – Window length (e.g. `900000` = 15 min)
- **RATE_LIMIT_MAX** – Max requests per window per IP
- **AUTH_RATE_LIMIT_*** – Optional overrides for auth routes if you hit 429 during development.

### Database

- **POSTGRES_HOST** – Local backend: usually `localhost`; Docker backend: `postgres` (service name).
- **POSTGRES_PORT** – Local backend: `5433`; Docker backend: `5432`.
- **POSTGRES_DB**, **POSTGRES_USER**, **POSTGRES_PASSWORD** – Database credentials.

## Frontend (`frontend/.env`)

Copy from `frontend/env.example`:

```bash
cp frontend/env.example frontend/.env
```

### API URL

- **NEXT_PUBLIC_API_URL** – Base URL for API calls from the browser.
  - For local dev with frontend on `http://localhost:3002`: set to `http://localhost:4002`.
  - When serving at `https://memoon-card.localhost`: set to empty `""` so requests are same-origin and the refresh cookie works.

## Summary

1. **Root:** `cp env.example .env` — ports and `NODE_ENV`.
2. **Backend:** `cp backend/env.example backend/.env` — JWT, CORS, rate limits.
3. **Frontend:** `cp frontend/env.example frontend/.env` — `NEXT_PUBLIC_API_URL`.

For full run/setup steps, see `documentation/SETUP.md`.
