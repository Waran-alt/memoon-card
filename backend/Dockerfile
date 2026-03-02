# Multi-stage build for backend
# Build context: project root (.)
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# Liquibase + PostgreSQL driver for running migrations at backend startup (no separate migrate container)
FROM liquibase/liquibase:latest AS liquibase-tools
USER root
RUN lpm add postgresql --global

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

# Runtime: Node + Python + fsrs-optimizer (core of the app)
FROM deps AS runner
WORKDIR /app
# System Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --no-cache-dir --break-system-packages --upgrade pip
# Long timeout and retries for CI; install PyTorch CPU-only first (smaller, more reliable), then fsrs-optimizer
ENV PIP_DEFAULT_TIMEOUT=900 PIP_RETRIES=5
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    torch --index-url https://download.pytorch.org/whl/cpu \
    && python3 -m pip install --no-cache-dir --break-system-packages fsrs-optimizer

# Liquibase: run migrations at startup (no separate migrate container)
COPY --from=liquibase-tools /liquibase /opt/liquibase
COPY --from=liquibase-tools /opt/java /opt/java
ENV JAVA_HOME=/opt/java/openjdk LIQUIBASE_HOME=/opt/liquibase
ENV PATH="/opt/java/openjdk/bin:/opt/liquibase:$PATH"
COPY migrations /app/migrations
COPY backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

COPY --from=builder /app/backend/dist ./backend/dist
# Replace workspace symlink with real package so Node finds dist at node_modules/@memoon-card/shared/dist
RUN rm -rf ./node_modules/@memoon-card/shared && mkdir -p ./node_modules/@memoon-card/shared
COPY --from=builder /app/shared/package.json ./node_modules/@memoon-card/shared/
COPY --from=builder /app/shared/dist ./node_modules/@memoon-card/shared/dist
EXPOSE 4002
WORKDIR /app/backend
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["yarn", "start"]

# Development - volume overlays /app/backend with host source
FROM deps AS development
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --no-cache-dir --break-system-packages --upgrade pip
ENV PIP_DEFAULT_TIMEOUT=900 PIP_RETRIES=5
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    torch --index-url https://download.pytorch.org/whl/cpu \
    && python3 -m pip install --no-cache-dir --break-system-packages fsrs-optimizer

COPY --from=builder /app/backend/dist ./backend/dist
RUN rm -rf ./node_modules/@memoon-card/shared && mkdir -p ./node_modules/@memoon-card/shared
COPY --from=builder /app/shared/package.json ./node_modules/@memoon-card/shared/
COPY --from=builder /app/shared/dist ./node_modules/@memoon-card/shared/dist
EXPOSE 4002
WORKDIR /app/backend
CMD ["yarn", "dev"]
