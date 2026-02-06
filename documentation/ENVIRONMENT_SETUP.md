# Environment setup

Create `.env` files from the examples below. **Never commit `.env` files.**

## Overview

| Where | File | Purpose |
|-------|------|--------|
| Root | `.env` | Shared: `NODE_ENV`, `FRONTEND_PORT`, `BACKEND_PORT`. Used by Docker Compose and local scripts. |
| Backend | `backend/.env` | JWT secrets, CORS, rate limiting, request size. |
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

Docker Compose and scripts read this file. Service-specific config lives in backend/frontend `.env`.

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

## Frontend (`frontend/.env`)

Copy from `frontend/env.example`:

```bash
cp frontend/env.example frontend/.env
```

### API URL

- **NEXT_PUBLIC_API_URL** – Base URL for API calls from the browser.
  - For local dev with frontend on `http://localhost:3002`: set to `http://localhost:4002`.
  - When serving at `https://memoon-card.localhost`: set to empty `""` so requests are same-origin and the refresh cookie works.

### E2E (Playwright)

Only needed when running `yarn test:e2e`:

- **E2E_BASE_URL** – Base URL of the app (e.g. `https://memoon-card.localhost` or `http://localhost:3002`). Defaults are in `frontend/e2e/config.ts`.
- **E2E_TEST_PASSWORD** – Password for the auto-created test user. Optional; a random one is used if unset.

For same-origin cookies (recommended), run the app at `https://memoon-card.localhost` with `NEXT_PUBLIC_API_URL=""` and set `E2E_BASE_URL=https://memoon-card.localhost`. See `frontend/e2e/README.md`.

## Summary

1. **Root:** `cp env.example .env` — ports and `NODE_ENV`.
2. **Backend:** `cp backend/env.example backend/.env` — JWT, CORS, rate limits.
3. **Frontend:** `cp frontend/env.example frontend/.env` — `NEXT_PUBLIC_API_URL`; add E2E vars only if running Playwright.
