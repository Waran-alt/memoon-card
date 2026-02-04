# Multi-stage build for client backend
# Build context: memoon-card root (.) or Portfolio root with PROJECT_ROOT=clients/memoon-card
# Volume mounts source to /app/clients/memoon-card/backend - workspace must live there
# Uses Debian (bookworm-slim) so PyTorch/torch has pre-built wheels for fsrs-optimizer; Alpine has none.
ARG PROJECT_ROOT=.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# Workspace setup - put client at /app/clients/memoon-card to match volume mount path
FROM base AS workspace-setup
ARG PROJECT_ROOT=.
WORKDIR /app
RUN mkdir -p clients/memoon-card/frontend clients/memoon-card/backend

COPY ${PROJECT_ROOT}/.yarnrc.yml ./clients/memoon-card/.yarnrc.yml
COPY ${PROJECT_ROOT}/package.json ./clients/memoon-card/package.json
COPY ${PROJECT_ROOT}/frontend/package.json ./clients/memoon-card/frontend/package.json
COPY ${PROJECT_ROOT}/backend/package.json ./clients/memoon-card/backend/package.json
COPY ${PROJECT_ROOT}/.yarn* ./clients/memoon-card/.yarn/
COPY ${PROJECT_ROOT}/backend/yarn.lock* ./clients/memoon-card/backend/yarn.lock

# Install dependencies
FROM workspace-setup AS deps
WORKDIR /app/clients/memoon-card
RUN yarn install
WORKDIR /app

# Build
FROM deps AS builder
ARG PROJECT_ROOT=.
COPY ${PROJECT_ROOT}/backend ./clients/memoon-card/backend
WORKDIR /app/clients/memoon-card/backend
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

COPY --from=builder /app/clients/memoon-card/backend/dist ./clients/memoon-card/backend/dist
EXPOSE 4002
WORKDIR /app/clients/memoon-card/backend
CMD ["yarn", "start"]

# Development - volume overlays /app/clients/memoon-card/backend with host source
FROM deps AS development
ARG PROJECT_ROOT=.
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    && python3 -m pip install --no-cache-dir --break-system-packages --upgrade pip \
    && python3 -m pip install --no-cache-dir --break-system-packages fsrs-optimizer \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/clients/memoon-card/backend/dist ./clients/memoon-card/backend/dist
EXPOSE 4002
WORKDIR /app/clients/memoon-card/backend
CMD ["yarn", "dev"]
