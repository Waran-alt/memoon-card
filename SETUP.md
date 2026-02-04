# Memoon Card - Setup Guide

Quick setup guide for Memoon Card application.

## Configuration

- **Client ID**: `memoon-card`
- **Subdomain**: `memoon-card`
- **Full URL**: `https://memoon-card.yourdomain.com`
- **Frontend Port**: `3002`
- **Backend Port**: `4002`
- **Database**: `memoon_card_db`

## Environment Setup

Create a `.env` file in the client root directory with the following variables:

```bash
# =============================================================================
# APPLICATION
# =============================================================================
NODE_ENV=development

# =============================================================================
# FRONTEND
# =============================================================================
FRONTEND_PORT=3002
NEXT_PUBLIC_API_URL=http://localhost:4002

# =============================================================================
# BACKEND
# =============================================================================
BACKEND_PORT=4002

# =============================================================================
# DATABASE
# =============================================================================
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=memoon_card_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# =============================================================================
# DATABASE CONNECTION (for Liquibase, optional)
# =============================================================================
# DATABASE_URL=jdbc:postgresql://localhost:5432/memoon_card_db
```

**Important Notes:**
- Update `POSTGRES_PASSWORD` with a secure password
- Configure client-specific variables (JWT, CORS, LOG_LEVEL, etc.) as needed for your application
- Ports must match the values in `client.config.json` (3002/4002)

## Development

### Standalone Development

```bash
# Start database
docker-compose up -d postgres

# Run migrations
yarn migrate:up

# Start backend
cd backend && yarn dev

# Start frontend (in another terminal)
cd frontend && yarn dev
```

### Integrated with Portfolio

When integrated with the Portfolio monorepo, run these **from the Portfolio root**:

1. **Integrate** (first time or after adding/updating clients):
   ```bash
   yarn integrate
   ```

2. **Run migrations** (if the client has a database):
   ```bash
   yarn migrate:clients
   ```

3. **Start all services**:
   ```bash
   yarn start
   ```

### Managing Docker When Working from Client Folder

When you work inside this client directory (e.g. `clients/memoon-card/`) but the stack runs from the Portfolio root:

| Task                                        | From memoon-card folder                                                           | From Portfolio root                                                           |
|---------------------------------------------|-----------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| **Rebuild** (after Dockerfile/deps changes) | `../../scripts/rebuild-client.sh` (auto-detects client)                           | `yarn clients:rebuild memoon-card`                                            |
| **Rebuild + restart**                       | `../../scripts/rebuild-client.sh --restart`                                       | `yarn clients:rebuild memoon-card -- --restart`                               |
| **Restart** (no rebuild)                    | `../../scripts/docker-stack.sh restart memoon-card-backend memoon-card-frontend`  | `./scripts/docker-stack.sh restart memoon-card-backend memoon-card-frontend`  |
| **Logs**                                    | `../../scripts/docker-stack.sh logs -f memoon-card-frontend`                      | `./scripts/docker-stack.sh logs -f memoon-card-frontend`                      |

**Note:** Source code changes use hot reload via volume mounts—no rebuild. Rebuild only when changing `Dockerfile`, `package.json` dependencies, or other build-time config.

## Access

- **Frontend**: http://localhost:3002
- **Backend API**: http://localhost:4002
- **Production URL**: https://memoon-card.yourdomain.com


### Database (pgAdmin) when integrated with Portfolio

1. From Portfolio root, run `yarn start:pgadmin`.
2. Open http://localhost:5050 and log in (`PGADMIN_EMAIL` / `PGADMIN_PASSWORD` from root `.env`).
3. **Register server**: Right-click **Servers** → **Register** → **Server**
   - **General** → Name: e.g. `Portfolio`
   - **Connection** → Host: `postgres`, Port: `5432`, Username/Password: from root `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`)
4. **Find database**: Expand **Servers** → your server → **Databases** → `memoon_card_db` → **Schemas** → **public** → **Tables**


## Notes

- Ports are configured in `client.config.json`
- Database name is `memoon_card_db`
- This file was auto-generated - update as needed for your setup
