# Environment setup

Create `.env` files from the examples below. **Never commit `.env` files.**

> Checklist secrets / JWT / `NEXT_PUBLIC_*` : `documentation/private/CODEBASE_AUDIT_GRID.md` (sections 1 and 4).

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
- **JWT_REFRESH_EXPIRES_IN** – Default refresh token TTL when the user does **not** check “trust this device” (e.g. `7d`). The cookie `maxAge` follows the JWT `exp` from the issued token.
- **JWT_REFRESH_TRUSTED_EXPIRES_IN** – Refresh TTL when “trust this device” is checked (default `30d`). The refresh JWT includes claim `td`; rotation keeps the same trusted vs standard duration.

### CORS

- **CORS_ORIGIN** – Allowed origin for browser requests (e.g. `http://localhost:3002` or `https://memoon-card.localhost`)
- **CORS_ORIGINS** – Optional; comma-separated list if you need multiple origins.

Backend must allow the frontend origin you use (localhost or `https://memoon-card.localhost`), or login/register will fail with CORS errors.

### Rate limiting

- **RATE_LIMIT_WINDOW_MS** – Window length (e.g. `900000` = 15 min)
- **RATE_LIMIT_MAX** – Max requests per window per IP
- **AUTH_RATE_LIMIT_*** – Optional overrides for **login and register only** (not refresh/session). Increase if legitimate users still hit 429 after typos.
- **FORGOT_PASSWORD_RATE_LIMIT_*** / **RESET_PASSWORD_RATE_LIMIT_*** – Optional overrides for forgot-password and reset-password (per IP). Defaults: 5 and 10 requests per hour.
- **FORGOT_PASSWORD_EMAIL_RATE_LIMIT_*** – Optional overrides for the second forgot-password bucket (per normalized email hash). Default: 3 per hour.

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
