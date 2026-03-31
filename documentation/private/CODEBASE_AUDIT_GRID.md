# Grille d’audit — toute la codebase (MemoOn-Card)

> **Archivé (2026-03-30)** — Copie canonique sous `documentation/private/`. Historique des passes en bas ; les commentaires d’audit ajoutés dans le code restent la trace vivante. Pour une nouvelle campagne, dupliquer ou réactiver une grille dans `documentation/` à partir de ce modèle.

Document de **contrôle systématique** : sécurité, robustesse, conformité aux choix d’archi du projet. À parcourir **au moins** avant une release majeure ou après un gros refactor ; les items « continu » peuvent être intégrés à la revue de PR.

**Légende (preuve attendue)** : cocher une case = tu peux pointer un fichier, une config, un test, ou une capture d’exécution (`npm audit`, CI).

**Périmètre** : monorepo racine, `backend/`, `frontend/`, `shared/`, `migrations/`, Docker / déploiement, CI.

**Commentaires** : pendant un passage de grille (ou une revue ciblée), tu peux **ajouter des commentaires à volonté** dans les fichiers du périmètre contrôlé lorsqu’il en manque — intention, invariant de sécurité, piège historique, lien avec une autre partie du code. **Mieux vaut un peu trop de commentaires que pas assez** ; évite seulement de paraphraser ce que le code exprime déjà mot pour mot.

**Remédiation (sécuriser / optimiser)** : la grille n’est pas seulement une couche de doc. Pour chaque contrôle : vérifier l’état → **corriger** code, config ou dépendances si besoin → **prouver** (test, CI, `yarn npm audit --all`, capture). Les commentaires viennent en complément pour figer l’intention et accélérer les prochaines passes.

---

## 1. Authentification & sessions

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 1.1 | Secrets JWT forts en prod, jamais dans le dépôt | `backend/.env` (non commité), `backend/env.example`, hébergeur |
| 1.2 | Algorithme JWT explicite (ex. HS256) cohérent sign/verify | `backend/src/constants/security-jwt.constants.ts`, `middleware/auth.ts`, `routes/auth/jwtRefreshVerify.ts` |
| 1.3 | Refresh en httpOnly ; rotation + détection de réutilisation | `refresh-token.service`, routes `routes/auth/session.routes.ts`, cookie dans `auth-route.helpers.ts` |
| 1.4 | « Trust device » : TTL aligné cookie / JWT | `auth-route.helpers`, `JWT_REFRESH_TRUSTED_*`, tests auth |
| 1.5 | Mot de passe oublié : pas de fuite d’existence compte ; lien non empoisonnable | `password.routes.ts`, `resolvePasswordResetBaseUrl` |
| 1.6 | Rate limits login / register / forgot / reset (IP + email si applicable) | `routes/auth/authLimiters.ts`, `http.constants`, `config/env.ts` |
| 1.7 | Rôles admin/dev : impossible sans `requireAdmin` / `requireDev` | `index.ts`, `middleware/auth.ts`, `dev.routes.ts`, `admin.routes.ts` |

---

## 2. API backend (Express)

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 2.1 | Ordre middleware : sécurité → CORS → limites → body → routes publiques → CSRF sur `/api` mutating | `backend/src/index.ts` |
| 2.2 | CSRF : Origin / Referer / header requis pour POST/PUT/PATCH/DELETE | `middleware/csrf.ts`, tests `csrf.test.ts` |
| 2.3 | CORS : origines explicites, pas de wildcard avec credentials | `config/env`, `getAllowedOrigins`, `index.ts` |
| 2.4 | `trust proxy` cohérent avec le reverse proxy (1 hop) | `index.ts` |
| 2.5 | Taille max body | `MAX_REQUEST_SIZE`, `index.ts` |
| 2.6 | Rate limit global `/api/` + limites métier si besoin | `index.ts`, constantes env |
| 2.7 | Validation entrées (Zod) sur routes sensibles | `schemas/`, `middleware/validation.ts` |
| 2.8 | Pas de SQL concaténé ; uniquement paramètres `$1`… | `services/*.ts`, grep `pool.query` |
| 2.9 | Accès ressources toujours filtré par `user_id` (pas d’IDOR) | `deck.service`, `card.service`, routes decks/cards/reviews/study |
| 2.10 | Erreurs : pas de stack ni secrets en prod | `errorHandler`, `NODE_ENV` |
| 2.11 | `/health` prod minimal (pas de fuite d’infra) | `index.ts` GET `/health` |
| 2.12 | Sous-processus : pas de shell sur entrées utilisateur | `utils/run-spawn.ts`, `optimization.service.ts`, `optimizer-spawn.constants.ts` |

---

## 3. Données & base (Postgres / Liquibase)

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 3.1 | Migrations révisées (pas de données sensibles en clair dans le XML) | `migrations/changesets/` |
| 3.2 | Index / contraintes sur clés étrangères et colonnes de jointure user | schéma SQL / changesets |
| 3.3 | Tokens reset / refresh : stockage hashé, TTL, usage unique si prévu | services reset + refresh, tables |
| 3.4 | Backup / restore documenté (hors code si applicable) | doc déploiement |

---

## 4. Frontend (Next.js)

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 4.1 | Pas de secrets dans `NEXT_PUBLIC_*` | `frontend/.env`, `frontend/env.example` |
| 4.2 | Appels API : credentials / cookies selon même origine ou CORS documenté | `lib/api`, hooks, `NEXT_PUBLIC_API_URL` |
| 4.3 | Pas de `dangerouslySetInnerHTML` non sanitisé sur contenu utilisateur | grep projet frontend |
| 4.4 | Liens externes : `rel` / politique si markdown riche | composants cartes / contenu |
| 4.5 | Routes protégées : redirection login cohérente | `app/[locale]/(protected)/` |
| 4.6 | Headers / CSP côté Next (si configurés) alignés avec l’API | `next.config.js`, middleware Next |
| 4.7 | i18n : pas de chaînes sensibles hardcodées hors fichiers locales | `public/locales/` |

---

## 5. Package `shared/`

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 5.1 | Pas de logique secrète ou clés dans `shared` | `shared/src` |
| 5.2 | Types / constantes alignés backend ↔ frontend après changement | build `shared`, imports |

---

## 6. Dépendances & supply chain

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 6.1 | `npm audit` (racine, backend, frontend) — traiter high/critical | CI ou manuel |
| 6.2 | Lockfiles commités, installs reproductibles | `package-lock.json` |
| 6.3 | Pas de dépendance abandonnée critique sans plan | revue périodique |
| 6.4 | Scripts `postinstall` suspects | `package.json` des 3 packages |

---

## 7. Docker, CI, déploiement

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 7.1 | Images : user non-root si possible, pas de secrets dans Dockerfile | `Dockerfile*`, compose |
| 7.2 | Variables sensibles en secrets, pas en variables publiques | doc Hostinger / GitHub Actions |
| 7.3 | HTTPS terminé correctement ; `Secure` cookie en prod | `DEPLOYMENT-*.md`, `ENVIRONMENT_SETUP.md` |
| 7.4 | Secrets rotation documentée (JWT, DB, SMTP futur) | doc interne |

---

## 8. Journalisation & vie privée

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 8.1 | Logs : email/token/mot de passe jamais en clair | `logger`, `auth` (mask email) |
| 8.2 | Niveau de log adapté en prod | `NODE_ENV`, transport logs |
| 8.3 | Données perso : minimisation (ce que la loi impose selon ton périmètre) | schéma users, exports |

---

## 9. Tests & régression sécurité

| # | Contrôle | Où regarder / preuve |
|---|----------|----------------------|
| 9.1 | Tests auth, CSRF, validation critiques verts | `backend/src/__tests__/` |
| 9.2 | Nouveau endpoint mutating : test 401 sans token + 403 si applicable | conventions routes |
| 9.3 | E2E login / session si pipeline existe | `frontend/e2e/` |

---

## 10. Revue « changement récent »

À refaire **à chaque PR** qui touche :

- [ ] Auth / cookies / JWT  
- [ ] Nouvelle route API ou paramètre query/body  
- [ ] SQL ou migration  
- [ ] Intégration tierce (email, paiement, analytics)  
- [ ] `next.config` / headers / proxy  

---

## Utilisation suggérée

1. **Sprint / release** : parcourir les sections 1 → 9 et noter les écarts dans les issues.  
2. **PR** : section 10 + sections impactées.  
3. **Preuve** : pour chaque écart, lien PR + correctif ou risque accepté documenté.

Pour une **première passe complète** sur le dépôt : assigner les sections à des owners (backend / frontend / ops) et dater la dernière exécution en bas de ce fichier (tableau ou commentaire).

---

## Historique des passages (grille + commentaires code)

| Date       | Périmètre principal | Notes |
|------------|---------------------|-------|
| 2026-03-30 | Sections 1-2 backend, refresh, spawn, optimizer, frontend lib | Passe 1 : auth, index, CSRF, cookies, erreurs, refresh service, password reset, run-spawn, JWT et optimizer constants. |
| 2026-03-30 | Validation, services scopes, shared, next.config, requestId | Passe 2 : validation middleware, deck/card/knowledge/category services, shared package, next rewrites, requestId, sanitize header, review service, dev routes, user routes/services, cards/reviews route headers. |
| 2026-03-30 | Routes restantes, metrics/optimization, Next middleware, migrations, Docker backend | Passe 3 : decks, fsrs-metrics, optimization, admin, knowledge, users routes; fsrs-metrics + optimization services; next.config + frontend middleware; changelog.xml note; backend Dockerfile env note. |
| 2026-03-30 | READMEs, Docker frontend/Liquibase, i18n middleware | Passe 4 : liens grille (documentation index, backend/frontend/e2e/adr/private README); racine README + env.example; Docker frontend + Liquibase; i18n/middleware.ts; nouveau shared/README.md. |
| 2026-03-30 | shared/, archivage grille | Passe 5 : package shared documente (README, index, validation.constants); grille deplacee ici (`documentation/private/`). |
| 2026-03-30 | CI, compose, logger, env, DB, FSRS, feature flags, studySync | Passe 6 : docker-compose.yml (secrets dev vs prod), ci.yml (audit/immutable/E2E), logger + database + env (pas de secrets en logs), feature-flag.service, fsrs.service, frontend studySync. |
| 2026-03-30 | Liquibase entrypoint, constants, study-health, admin flags, app layout | Passe 7 : docker-entrypoint.sh (migrate puis exec), database.constants + app.constants, study-health-dashboard/alerts, admin-feature-flags, layout app/(protected)/app. |
| 2026-03-30 | CSRF, errorHandler, e2e script, doc deploiement | Passe 8 : csrf.ts (en-tete unifie), errorHandler (messages client vs fuite prod), e2e-cleanup.js (requete fixe), DEPLOYMENT-HOSTINGER.md lien grille privee. |
| 2026-03-30 | Deck/card services, refresh, auth lib, env doc, http constants, password reset | Passe 9 : deck/card JSDoc IDOR, refresh-token (pas de log token), frontend lib/auth.ts, ENVIRONMENT_SETUP lien grille, http.constants Helmet, password-reset prod logs. |
| 2026-03-30 | auth middleware, errors, AppLayoutShell, SETUP | Passe 10 : auth.ts (JWT, roles admin/dev, getUserId), errors.ts messages client, AppLayoutShell UI vs API, SETUP.md lien grille. |
| 2026-03-30 | sanitize, fsrs.constants, auth.store, TROUBLESHOOTING | Passe 11 : sanitize helpers, fsrs defaults note, auth.store decode JWT exp only, troubleshooting lien securite/grille. |
| 2026-03-30 | optimization.constants, useUserStudySettings, COMMAND_REFERENCE, auth session/register | Passe 12 : optimization.constants (timeouts/buffer vs spawn), hook settings + shared bounds, COMMAND_REFERENCE qualite, session.routes + registerLogin.routes en-tetes. |
| 2026-03-30 | Auth restant, policy, flags, card-flag, types, dev-db, env examples, UI stores | Passe 13 : logout/password/jwtRefresh/authLimiters JSDoc; policy-version; feature-flag + card-flag en-tetes; database.ts password_hash; dev-db requireDev; frontend/backend/root env.example; lib/env NEXT_PUBLIC; ConnectionSyncBanner; connectionSync store; SignOutButton; AuthHydrate. |
| 2026-03-30 | JWT constants, fsrs-time, lockfile script | Passe 14 : security-jwt.constants JSDoc (HS256), fsrs-time.utils en-tete, lockfile-refresh.sh (supply chain 6.2). |
| 2026-03-30 | FSRS core/content, index API, quick start, prod compose, E2E config, metrics job, app home | Passe 15 : fsrs-core/fsrs-content en-tetes; index.ts Helmet/CORS/trust proxy; QUICK_START + docker-compose.prod note; e2e/config; fsrs-metrics-job.service; page app (decks) JSDoc. |
| 2026-03-30 | ensureDevUser, types frontend, ARCHITECTURE, E2E specs/helpers | Passe 16 : dev bootstrap DEV_* (prod avertissement), types role UI vs API, ARCHITECTURE lien grille, auth/login/study/deck-detail/smoke + helpers i18n. |
| 2026-03-30 | Remédiation supply chain (Next.js) | Passe 17 : `next` frontend ^16.1.7 (advisories CSRF Server Actions / HMR <16.1.7) ; paragraphe « Remédiation vs commentaires » en tête de grille. |
| 2026-03-30 | CI, audit Yarn 4, Next build, express-rate-limit | Passe 18 : `ci.yml` — `yarn npm audit --severity high` (Yarn 4, remplace `--audit-level`) ; étape **`yarn build:frontend`** après type-check (preuve App Router / types Next sans dépendre d’un `.next` local root-owned) ; `frontend/tsconfig` exclut `.next` pour `tsc --noEmit` stable ; backend `express-rate-limit` ^8.2.2 (GHSA-46wh-pxpv-q5gq, dual-stack rate limit bypass). |
| 2026-03-30 | Tests 401 + CSRF ordre réel (cards / reviews / study) | Passe 19 : `protected-routes-auth.test.ts` — pile `csrfProtection` → `authMiddleware` → routes ; **401** sans Bearer sur GET `/api/study/stats`, POST batch reviews, POST card review, PUT card ; **403** CSRF si mutation sans `Origin`/`Referer`/`X-Requested-With` (aligné `index.ts`). |
| 2026-03-30 | errorHandler, logs 401 | Passe 20 : toute `AuthenticationError` → **`logger.info`** (session : message « Expected unauthorized… » ; autres `/api/*` : « Unauthenticated API request » + `reason`) au lieu de **`logger.error`** ; tests `errorHandler.test.ts` (mock logger). |
| 2026-03-30 | cards.routes, retrait study-intensity | Passe 21 : routes statiques `/flags` avant `/:id` ; **suppression** API + code `study-intensity` / `study_intensity_mode` (jamais branché FSRS ni UI) ; migration `046-drop-user-settings-study-intensity-mode`. |
| 2026-03-30 | Script audit API frontend ↔ backend | Passe 22 : `scripts/api-route-audit.mjs` + `yarn audit:api` ; parse `index.ts` (dont `app.use` multi-middleware admin/dev) et chemins `/api` dans `frontend/src` + `frontend/e2e` ; `documentation/COMMAND_REFERENCE.md` ; CI `Audit API routes vs frontend` (informationnel, `continue-on-error`) ; sortie détaillée méthode + chemin pour routes backend-only. |

---

*Dernière mise à jour du document : voir tableau « Historique des passages ».*
