# Pages, purpose, and auth access

Review of the MemoOn Card web app routes: what each page does and who can access it.

---

## Route overview

| Route | Purpose | Auth |
|-------|--------|------|
| `/` | Redirect to default locale | Public |
| `/[locale]` (e.g. `/en`) | Landing or redirect to app | Public / session redirect |
| `/[locale]/login` | Sign in | Public |
| `/[locale]/register` | Create account | Public |
| `/[locale]/app` | My decks (list, create) | **Authenticated** |
| `/[locale]/app/decks/[id]` | Deck detail (cards, edit) | **Authenticated** |
| `/[locale]/app/decks/[id]/study` | Study session | **Authenticated** |
| `/[locale]/app/optimizer` | FSRS optimizer | **Authenticated** |
| `/[locale]/app/study-sessions` | Session history + health summary | **Authenticated** |
| `/[locale]/app/study-health` | Health dashboard (trends) | **Authenticated** |
| `/[locale]/app/admin` | User management (block, assign role) | **Admin only** |
| `/[locale]/app/dev` | Feature flags & technical panels | **Dev only** |

---

## Public routes

### `/` (root)

- **Purpose:** Single entry point. Redirects to the default locale (e.g. `/en`) so the app is reachable at `/`.
- **Auth:** None. No session check.

### `/[locale]` — Home / landing

- **Purpose:** Landing page when not signed in: app name, tagline, “Create account” and “Sign in” links. If the user has a session, they are redirected to `/[locale]/app`.
- **Auth:** Public. Session is read server-side; if present, redirect to app. No layout protection.

### `/[locale]/login`

- **Purpose:** Sign-in form. Submits to `/api/auth/login` and, on success, hydrates the auth store and typically redirects (e.g. to app or a return URL).
- **Auth:** Public. Intended for unauthenticated users.

### `/[locale]/register`

- **Purpose:** Registration form. Submits to `/api/auth/register` and, on success, stores auth and can redirect to app.
- **Auth:** Public.

---

## Protected routes (authenticated)

All routes under `/[locale]/(protected)/app/*` use the **protected layout** (`(protected)/layout.tsx`):

- Server-side: `getSession(cookieStore)`; if no session → redirect to `/login`.
- Client: `AuthHydrate` provides the server user to the auth store.

Inside the app, **AppLayoutShell** wraps all app pages and shows the main nav (decks, optimizer, study-sessions, study-health; admin only when `user?.role === 'admin'`).

### `/[locale]/app` — My decks

- **Purpose:** List the user’s decks, create new decks (title, optional description). Links to each deck’s detail page and to study.
- **Auth:** Any authenticated user. No role check.

### `/[locale]/app/decks/[id]` — Deck detail

- **Purpose:** View and manage a single deck: list cards, search/filter, add cards (recto/verso/comment), edit/delete cards, “reveal all”, “treat as new”, “expand delay”, link to study this deck.
- **Auth:** Any authenticated user. Deck access is scoped by backend (user’s decks). No role check.

### `/[locale]/app/decks/[id]/study` — Study session

- **Purpose:** Run a spaced-repetition study session for one deck: card queue, show/reveal, rate (Again / Hard / Good / Easy), submit reviews, session stats and duration.
- **Auth:** Any authenticated user. Session and reviews are user-scoped. No role check.

### `/[locale]/app/optimizer` — FSRS optimizer

- **Purpose:** Show optimization status (ready to optimize, last run, review counts, etc.) and trigger the FSRS parameter optimizer. Explains requirements (e.g. minimum reviews, days since last run).
- **Auth:** Any authenticated user. Optimizer runs in the context of the current user’s data. No role check.

### `/[locale]/app/study-sessions` — Study sessions

- **Purpose:** List past study sessions (summary: started/ended, event count, card count, rating counts). Per-session detail and a compact “study health” dashboard (auth refresh, journey consistency, study API latency, throughput). Links to the full study-health page.
- **Auth:** Any authenticated user. Data is user-scoped. No role check.

### `/[locale]/app/study-health` — Study health dashboard

- **Purpose:** Operational trends over time: auth refresh (totals, failures, reuse), journey consistency (mismatch rate, thresholds), study API latency (overall and by route), review throughput by day. Charts/sparklines for monitoring.
- **Auth:** Any authenticated user. Data is user-scoped (or aggregated for that user). No role check.

---

## Admin-only route

### `/[locale]/app/admin` — Admin panel (user management)

- **Purpose:** User management (block, assign role). Placeholder — coming soon. Feature flags are in the Dev panel.
- **Auth:**
  - **Layout:** Still behind the protected layout (must be logged in). If not logged in, user is redirected to `/login`.
  - **Page-level:** If logged in but `user.role !== 'admin'`, the page does **not** call any admin API and renders an “Access restricted” view (title, message, “Back to My decks” link).
  - **Nav:** The “Admin” link in **AppLayoutShell** is shown only when `user?.role === 'admin'`. Non-admins do not see the link but can hit the URL directly; they then see the access-denied content.
- **Backend:** `/api/admin/*` (e.g. `/api/admin/users`) protected by **requireAdmin**. Dev cannot access.

---

## Dev-only route

### `/[locale]/app/dev` — Dev panel (technical)

- **Purpose:** Feature flags, rollouts, per-user overrides. All changes in the audit log. Admins cannot access.
- **Auth:** Layout: protected. Page: if `user.role !== 'dev'` then Access restricted. Nav: Dev link only when `user?.role === 'dev'`.
- **Backend:** `/api/dev/*` (e.g. `/api/dev/feature-flags`) protected by **requireDev**. Admin cannot access.

---

## Summary

- **Public:** `/`, `/[locale]` (landing or redirect), `/[locale]/login`, `/[locale]/register`.
- **Authenticated (any logged-in user):** `/[locale]/app`, `/[locale]/app/decks/[id]`, `/[locale]/app/decks/[id]/study`, `/[locale]/app/optimizer`, `/[locale]/app/study-sessions`, `/[locale]/app/study-health`.
- **Admin only:** `/[locale]/app/admin` (user management). **Dev only:** `/[locale]/app/dev` (feature flags, technical panels). Each enforced in the UI and backend (requireAdmin vs requireDev).

Session is established via cookies and read in the protected layout and on the home page. Roles: **admin** = user management only (no technical APIs); **dev** = technical APIs and reserved panels (no user management). A user has one role: `user`, `admin`, or `dev`.
