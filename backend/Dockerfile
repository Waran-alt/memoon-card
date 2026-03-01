# Multi-stage build for backend
# Build context: project root (.)
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# Workspace setup
FROM base AS workspace-setup
WORKDIR /app
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

# Build (shared must be built first so @memoon-card/shared resolves to dist/)
FROM deps AS builder
COPY backend ./backend
COPY shared ./shared
WORKDIR /app
RUN yarn workspace @memoon-card/shared build
WORKDIR /app/backend
RUN yarn build

# Runtime
FROM deps AS runner
WORKDIR /app
# Python + fsrs-optimizer (torch has manylinux wheels on Debian; not on Alpine)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    && python3 -m pip install --no-cache-dir --break-system-packages --upgrade pip \
    && python3 -m pip install --no-cache-dir --break-system-packages fsrs-optimizer \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/backend/dist ./backend/dist
EXPOSE 4002
WORKDIR /app/backend
CMD ["yarn", "start"]

# Development - volume overlays /app/backend with host source
FROM deps AS development
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    && python3 -m pip install --no-cache-dir --break-system-packages --upgrade pip \
    && python3 -m pip install --no-cache-dir --break-system-packages fsrs-optimizer \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/backend/dist ./backend/dist
EXPOSE 4002
WORKDIR /app/backend
CMD ["yarn", "dev"]
