# Frontend

Frontend application for memoon-card.

## Setup

Choose your frontend framework and initialize:

### Option 1: Next.js (Recommended, matches Portfolio stack)

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-git --import-alias "@/*"
```

### Option 2: React + Vite

```bash
npm create vite@latest . -- --template react-ts
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
- `NEXT_PUBLIC_API_URL` (for Next.js)
- `FRONTEND_PORT`
