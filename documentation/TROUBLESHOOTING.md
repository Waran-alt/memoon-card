# Troubleshooting

Use this matrix when local setup or Docker flow fails.

| Symptom | Likely cause | How to verify | Fix |
| --- | --- | --- | --- |
| Frontend not reachable on `http://localhost:3002` | Frontend container not running or port conflict | `docker compose ps` and `yarn docker:logs:frontend` | `yarn docker:restart:frontend`; if port conflict, change `FRONTEND_PORT` in `.env` and restart |
| Backend health check fails | Backend crashed or cannot connect to database | `yarn docker:logs:backend` and `curl http://localhost:4002/health` | Ensure Postgres is up (`yarn postgres` or `yarn docker:up`), then rerun migrations |
| Postgres connection refused on `5433` | Postgres container not running or host port changed | `docker compose ps postgres` | Start DB with `yarn postgres`; align `POSTGRES_PORT` in `.env` and `backend/.env` for local usage |
| `relation "users" does not exist` | Migrations were not applied | `yarn migrate:status` | Run `yarn migrate:up` (local) or `yarn migrate:docker` (Docker-based flow) |
| `Cannot find module '@memoon-card/shared'` in Docker | Workspace links missing due to stale container state | `yarn docker:logs:backend` | Recreate stack: `yarn docker:down` then `yarn docker:up`; if needed rebuild images with `yarn docker:build` |
| CORS errors in browser | Frontend origin not allowed in backend config | Browser console + backend logs | Set `CORS_ORIGIN` or `CORS_ORIGINS` in `backend/.env`, then restart backend |
| `yarn install` fails with lockfile immutability error | Local dependency resolution differs from committed lockfile | Review error from `yarn install` | Run `yarn lockfile:refresh`, then commit `yarn.lock` if intentionally updated |
| E2E tests fail to start browser | Playwright browsers not installed | `yarn test:e2e` output | Run `yarn test:e2e:install` once, then retry |
| E2E tests fail to reach app | App not running at `PLAYWRIGHT_BASE_URL` | `curl http://localhost:3002/en` | Start stack (`yarn docker:up`) or set `PLAYWRIGHT_BASE_URL` to a reachable frontend URL |

## Quick Diagnostics

```bash
docker compose ps
yarn docker:logs:backend
yarn docker:logs:frontend
curl -f http://localhost:4002/health
curl -f http://localhost:3002/en
```

## Still Blocked?

- Recreate clean runtime state: `yarn docker:down:volumes && yarn docker:up`
- Re-run migrations: `yarn migrate:docker`
- Check environment docs: `documentation/ENVIRONMENT_SETUP.md`

