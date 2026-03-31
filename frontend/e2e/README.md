# E2E tests (Playwright)

Run against a **running** frontend and backend (e.g. Docker stack or `yarn dev` + backend). Tests use **Chromium** only by default.

**Env:** keep `E2E_TEST_PASSWORD` and real credentials out of git (`frontend/.env` is gitignored). Same-origin and CORS below match `documentation/ENVIRONMENT_SETUP.md` and `documentation/private/CODEBASE_AUDIT_GRID.md`.

## One-time setup

```bash
# From repo root or frontend
yarn install
npx playwright install chromium
```

## Run tests

1. Start the app (frontend and backend reachable; frontend port from `FRONTEND_PORT` or default **3002** in Docker).
2. **Playwright reads `frontend/.env`:** `E2E_BASE_URL` (or `PLAYWRIGHT_BASE_URL`) is loaded automatically when you run `yarn test:e2e` from the repo root or from `frontend/`. Use a **full URL**.
3. **WSL + Docker:** If `E2E_BASE_URL=https://memoon-card.localhost` gives `net::ERR_CONNECTION_REFUSED`, Playwright (Linux) cannot reach whatever serves that host (often nginx on Windows only). Use **`http://localhost:3002`** (mapped frontend port) and ensure **`CORS_ORIGINS`** on the backend includes `http://localhost:3002`.
4. **Same origin for cookies:** When using `https://memoon-card.localhost`, the frontend must use the **same origin** for API calls so the refresh cookie is set for that host. Set `NEXT_PUBLIC_API_URL=""` (empty) in `frontend/.env` when serving behind nginx at that host, then **restart** the frontend container or dev server. If `NEXT_PUBLIC_API_URL` points at `http://localhost:4002` while the browser is on `memoon-card.localhost`, registration/login will fail or bounce to Sign in.
5. **CORS:** If you use `http://localhost:3002` for E2E, the backend must allow that origin (e.g. `CORS_ORIGINS` includes `http://localhost:3002`). For `https://memoon-card.localhost`, include that origin too.
6. From repo root or `frontend`:

   ```bash
   yarn test:e2e
   # or override for one run:
   PLAYWRIGHT_BASE_URL=https://memoon-card.localhost yarn test:e2e
   ```

Optional env (see `env.example`): `E2E_BASE_URL`, `PLAYWRIGHT_BASE_URL`, `E2E_TEST_PASSWORD`. Defaults live in `e2e/config.ts` (no hardcoded values in specs).

**i18n in specs:** Use `c('key')` / `a('key')` from `e2e/i18n.ts` (English strings from `public/locales/en/common.json` and `app.json`). Playwright is configured with `locale: 'en-US'` and routes use `/en/…` so copy matches the JSON. Helpers: `expectMyDecksHeading` in `e2e/helpers.ts` waits for the My decks heading (after successful navigation to the app shell). `AppLayoutShell` also sets `data-e2e-shell-ready` on `<html>` after paint if you need it for other checks.

## What’s covered

- **auth.spec.ts**: Landing (Create account / Sign in); unauthenticated redirect to login for `/app` and `/app/decks/:id`; register short-password validation; login wrong-password error; login/register navigation; logged-in redirect from `/` to My decks.
- **login.spec.ts**: Full flow: register → sign out → sign in with same credentials → My decks.
- **study.spec.ts**: Register → create deck → create card → study (Good) → Session complete; study empty deck (No cards to study); two cards with Again/Easy and session count; exit study → deck; two decks on My decks and Back to decks.

Credentials are generated per run (no shared test user).
