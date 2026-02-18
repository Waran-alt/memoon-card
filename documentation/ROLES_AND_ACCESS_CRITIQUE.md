# Roles and access: critique and implementation

Review of **which elements should be accessible to whom**, and a **critical look** at adding roles. **Update:** the **dev** role has been implemented; **guest** and **moderator** were not added.

---

## 1. Current state

### Roles today

| Role   | Meaning in code        | Who gets it        |
|--------|------------------------|--------------------|
| (none) | Unauthenticated        | Anyone not logged in |
| `user` | Default for registered users | After register or login |
| `admin` | Can manage feature flags | Set in DB; admin panel + APIs |

### Access matrix (current)

| Area | Public (no session) | Authenticated (`user`) | `admin` |
|------|--------------------|------------------------|---------|
| Landing, login, register | ✅ | Redirect to app | Redirect to app |
| My decks, deck detail, study | ❌ | ✅ | ✅ |
| Optimizer, study-sessions, stats & health | ❌ | ✅ | ✅ |
| Admin panel (feature flags) | ❌ | ❌ (access denied) | ✅ |
| Admin API (`/api/admin/*`) | ❌ | ❌ 403 | ✅ |

Backend: `users.role` is `'user' | 'admin'`; `requireAdmin` middleware checks `role === 'admin'`. Frontend: admin nav and admin page content are gated on `user?.role === 'admin'`.

---

## 2. Proposed new roles: guest, moderator, dev

Before implementing, each role needs a **clear definition** and a **reason to exist** in this product.

### 2.1 Guest

**Ambiguity:** “Guest” usually means one of two different things:

- **A) Unauthenticated visitor**  
  No account, no session. They already exist today (we just don’t call them “guest”). Adding a `guest` **role** for them would mean creating a session or a special token for “logged-in guest”—which is a different model (e.g. anonymous session with optional upgrade to full user).

- **B) Logged-in but restricted**  
  A real user row with `role = 'guest'`: can use the app with limits (e.g. read-only, or N decks, or no optimizer). That implies: how do they get an account? Invite-only? Special signup path?

**Critique:**

- If “guest” = unauthenticated: no new role needed; they’re just “not logged in.” Naming them “guest” in docs is fine; storing a role for them is not.
- If “guest” = logged-in with limited access: you need a clear **capability list** (what can they do vs. `user`?) and a **creation path** (how does one become a guest?). Right now the app has no “limited” tier—only full user or admin.
- **Recommendation:** Don’t add a `guest` role until you have a concrete use case (e.g. “trial without email” or “read-only shared deck”). Then design the capability matrix and signup/invite flow first.

### 2.2 Moderator

**Possible meanings:**

- Content moderator: review/approve/delete other users’ decks or cards (e.g. reported content).
- User moderator: lock/unlock accounts, view reports.
- Support role: see more data (e.g. session history) to help users.

**Critique:**

- The app today is **single-tenant per user**: users see only their own decks/cards/sessions. There is no “other users’ content” to moderate, no reports, no shared/public decks. So “moderator” has **nothing to moderate** in the current feature set.
- Adding a moderator role without features that need moderation adds complexity (role checks, UI, docs) with no immediate benefit.
- **Recommendation:** Introduce a **moderator** role only when you add a feature that requires it (e.g. shared decks, reports, or support tooling). Until then, skip it.

### 2.3 Dev

**Possible meanings:**

- Same as admin but named “dev” for developers (cosmetic).
- Admin **plus** extra: e.g. debug endpoints, internal feature flags, logs, or “dev only” features.
- Read-only “ops” view: see health/errors without changing feature flags.

**Critique:**

- If dev = admin with a different name: redundant; pick one name (`admin` or `dev`) and stick to it.
- If dev = admin + more: then you need a **clear list of “more”** (which routes/APIs are dev-only?). That implies a small capability matrix: admin can do X, dev can do X + Y. Without Y, dev is just admin.
- “Dev” is also environment-sensitive: in production you might not want a “dev” role at all; in staging you might. That suggests role semantics might depend on environment or config, which complicates the model.
- **Recommendation:** If you only need “people who can change feature flags,” keep a single **admin** role. If you later add “dev-only” tools (e.g. debug panel, extra flags), then add **dev** with a defined superset of permissions and document it; otherwise avoid a second “power user” role.

---

## 3. What *should* be accessible to whom (principle-based)

Independent of guest/moderator/dev, it’s worth locking in principles:

| Principle | Today | Note |
|-----------|--------|------|
| Unauthenticated users | Only landing, login, register | ✅ Sensible; no app data |
| Authenticated users | All app features (decks, study, optimizer, sessions, stats) | ✅ All self-service |
| Admin-only | Feature flags + overrides | ✅ Single privileged surface |
| Backend must enforce role | Admin APIs use `requireAdmin` | ✅ Frontend is not the security boundary |

So:

- **Public:** Landing, login, register only.
- **Any authenticated user:** Full app (own data only); no role check except for admin.
- **Admin only:** Admin panel and `/api/admin/*`; both backend and frontend enforce.

If you add **guest** (logged-in restricted): you need a list of what they *cannot* do (e.g. no optimizer, or max 1 deck).  
If you add **moderator**: you need at least one feature that requires “moderate others’ content” or “see more than own data.”  
If you add **dev**: you need at least one capability that admin doesn’t have (or accept that dev = admin with another name).

---

## 4. Criticism summary

| Proposal | Criticism | Recommendation |
|----------|-----------|----------------|
| **Guest** | Unclear: unauthenticated (no role) vs. logged-in limited (needs capabilities + creation path). No current feature needs it. | Do not add until you have a concrete “limited tier” or anonymous use case. |
| **Moderator** | No moderation surface in the app (no shared content, no reports). Role would be unused. | Add only when you add features that require moderation. |
| **Dev** | Risk of “admin under another name” with no extra permissions. If there are extra permissions, they must be defined and enforced. | Either keep only admin, or add dev only when you have a defined “dev-only” capability set. |

Adding all three roles now would:

- Require DB migration (`users.role` enum or check), backend role checks, frontend branches, and tests.
- Introduce multiple roles with no current use case, increasing maintenance and confusion (“when do I use moderator?”).

---

## 5. Suggested approach (before coding)

1. **Keep the current model** (unauthenticated + `user` + `admin`) until you have a clear need for another role.
2. **Document “guest”** as “unauthenticated visitor” in docs only (no new role in DB).
3. **If you later add a restricted tier:**  
   - Define it explicitly (e.g. “logged-in guest: can study, max 1 deck, no optimizer”).  
   - Then add a role (e.g. `guest` or `trial`) and implement the capability matrix (routes + APIs).
4. **If you later add moderation:**  
   - Add features that need it first (e.g. shared decks, report flow).  
   - Then introduce `moderator` with a clear list of allowed actions.
5. **If you want a “dev” role:**  
   - Define what dev can do that admin cannot (e.g. access to `/api/debug/*` or “dev-only” flags).  
   - If there’s no difference, keep a single admin role and optionally rename in docs to “admin/dev” if it helps.

If after this you still want **guest**, **moderator**, and **dev** in code:

- Define each in one place (e.g. this doc or a ROLES.md): **name, who gets it, what they can access**.
- Define a **route × role** and **API × role** matrix.
- Plan **migration** (existing users stay `user` or `admin`; how do new roles get assigned?).
- Then implement backend first (DB + middleware), then frontend (nav, pages, API gates).

---

## 6. Optional: capability matrix if you add roles later

If you eventually add more roles, a compact matrix helps. Example (current + hypothetical):

| Route / API | Public | guest (if logged-in) | user | moderator | dev | admin |
|-------------|--------|----------------------|------|-----------|-----|-------|
| Landing, login, register | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| /app, decks, study, optimizer, sessions, stats | ❌ | ? | ✅ | ✅ | ✅ | ✅ |
| Moderation UI (future) | ❌ | ❌ | ❌ | ✅ | ? | ? |
| /api/admin/* (user management) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| /api/dev/* (feature flags, technical) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| /api/debug/* (future) | ❌ | ❌ | ❌ | ❌ | ✅ | ? |

Filling the “?” cells is exactly the design work to do before implementing. Doing this exercise now (even for hypothetical roles) makes it clear whether guest/moderator/dev are needed and what they should be allowed to do.
