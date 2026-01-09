# Backend

Backend API for memoon-card.

## Setup

### Option 1: Express with TypeScript (Recommended, matches Portfolio stack)

Initialize Express with TypeScript:

```bash
yarn init -y
yarn add express cors helmet morgan dotenv
yarn add -D typescript @types/node @types/express @types/cors tsx ts-node nodemon
```

Create basic structure:
- `src/index.ts` - Express server entry point
- `tsconfig.json` - TypeScript configuration
- `Dockerfile` - Docker build configuration

### Option 2: NestJS

```bash
npm i -g @nestjs/cli
nest new . --skip-git
```

### Option 3: Manual Setup

Create your own structure with your preferred framework.

## Development

```bash
yarn install
yarn dev
```

## Environment Variables

See root `.env.example` for required environment variables.

Make sure to set:
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `PORT` (backend port)
