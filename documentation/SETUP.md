# Setup Guide for Memoon Card

This guide will help you set up the memoon-card application from scratch.

## Prerequisites

- Node.js >= 22.0.0
- Yarn 4.9.2+ (or npm)
- Docker & Docker Compose
- PostgreSQL 17+ (or use Docker)
- Git

## Initial Setup

### 1. Install Yarn (if not already installed)

```bash
corepack enable
corepack prepare yarn@4.9.2 --activate
```

### 2. Install Dependencies

```bash
# Install Yarn dependencies at root (if using workspaces)
yarn install

# Or initialize frontend/backend separately
cd frontend && yarn install
cd ../backend && yarn install
```

### 3. Set Up Environment Variables

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Initialize Frontend

See `frontend/README.md` for framework-specific setup instructions.

Recommended: Next.js (matches Portfolio stack)

```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --app --no-git --import-alias "@/*"
cd ..
```

### 5. Initialize Backend

See `backend/README.md` for framework-specific setup instructions.

Recommended: Express with TypeScript (matches Portfolio stack)

```bash
cd backend
yarn init -y
yarn add express cors helmet morgan dotenv pg zod
yarn add -D typescript @types/node @types/express @types/cors @types/pg tsx
cd ..
```

Create basic `src/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 6. Set Up Database Migrations

The Liquibase migration structure is already set up in `migrations/`.

To run migrations:

```bash
# Ensure Liquibase is installed
# Option 1: Use Docker
docker run --rm -v $(pwd)/migrations:/liquibase/changelog \
  -e LIQUIBASE_COMMAND_URL=jdbc:postgresql://localhost:5432/memoon_card_db \
  -e LIQUIBASE_COMMAND_USERNAME=postgres \
  -e LIQUIBASE_COMMAND_PASSWORD=postgres \
  liquibase/liquibase update

# Option 2: Install Liquibase locally
# Download from https://www.liquibase.org/download
liquibase --changeLogFile=migrations/changelog.xml update
```

Or add a script to `package.json`:

```json
{
  "scripts": {
    "migrate:up": "liquibase --changeLogFile=migrations/changelog.xml update"
  }
}
```

### 7. Start Services

#### Option A: Docker Compose (Recommended)

```bash
docker-compose up -d
```

This starts:
- PostgreSQL database
- Backend API (if Dockerfile exists)
- Frontend (if Dockerfile exists)

#### Option B: Local Development

```bash
# Terminal 1: Start database
docker-compose up -d postgres

# Terminal 2: Start backend
cd backend && yarn dev

# Terminal 3: Start frontend
cd frontend && yarn dev
```

### 8. Verify Setup

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/health
- Database: `psql -h localhost -U postgres -d memoon_card_db`

## Next Steps

1. **Customize migrations**: Edit `migrations/changesets/001-initial-schema.xml` with your database schema
2. **Build features**: Start developing your application features
3. **Add tests**: Set up testing framework (Jest, Vitest, etc.)
4. **Set up CI/CD**: Configure GitHub Actions or similar
5. **Deploy**: Prepare for deployment (see deployment documentation)

## Project Structure

```
memoon-card/
├── frontend/              # Frontend application
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── backend/               # Backend API
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── migrations/            # Database migrations
│   ├── changelog.xml
│   └── changesets/
├── docker-compose.yml     # Docker services
├── .env.example          # Environment template
└── README.md             # Project overview
```

## Troubleshooting

### Port conflicts
- Change ports in `.env` if 3000, 4000, or 5432 are already in use

### Database connection issues
- Ensure PostgreSQL is running: `docker-compose ps`
- Check credentials in `.env` match docker-compose.yml

### Migration errors
- Verify database exists: `docker-compose exec postgres psql -U postgres -l`
- Check Liquibase configuration and changelog syntax
