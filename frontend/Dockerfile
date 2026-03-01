# Multi-stage build for frontend
# Build context: project root (.)
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# Workspace setup
FROM base AS workspace-setup
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN mkdir -p frontend backend shared

COPY .yarnrc.yml ./.yarnrc.yml
COPY package.json ./package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY shared/package.json ./shared/package.json
COPY shared ./shared
COPY .yarn* ./.yarn/
COPY yarn.lock* ./yarn.lock

# Install dependencies
FROM workspace-setup AS deps
WORKDIR /app
ENV YARN_ENABLE_IMMUTABLE_INSTALLS=0
RUN yarn install
WORKDIR /app

# Build (NEXT_PUBLIC_API_URL at build time; NODE_OPTIONS avoids OOM on small CI/VPS)
FROM deps AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:4002
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV NODE_OPTIONS="--max-old-space-size=4096"
WORKDIR /app
COPY shared ./shared
COPY frontend ./frontend
RUN yarn workspace @memoon-card/shared build
WORKDIR /app/frontend
RUN yarn build

# Runtime
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat curl
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy built application (standalone output - structure may vary by Next.js version)
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static

USER nextjs
EXPOSE 3002
ENV PORT=3002
ENV HOSTNAME="0.0.0.0"
WORKDIR /app
# Standalone output: when build runs from frontend/, Next.js puts server at frontend/server.js
CMD ["node", "frontend/server.js"]

# Development - volume overlays /app/frontend with host source
FROM deps AS development
WORKDIR /app
ENV NODE_ENV=development
RUN apk add --no-cache libc6-compat curl
COPY frontend ./frontend
COPY shared ./shared
WORKDIR /app/frontend
EXPOSE 3002
ENV PORT=3002
ENV HOSTNAME="0.0.0.0"
CMD ["yarn", "dev"]
