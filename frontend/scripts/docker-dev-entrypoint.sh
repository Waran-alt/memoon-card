#!/bin/sh
# Dev stack (docker-compose.yml): host bind-mounts ./frontend over /app/frontend. A production
# .next from `yarn build` or a partial .next breaks Next 16 dev (ENOENT on .next/dev/required-server-files.json).
set -e
cd /app/frontend
if [ -d .next ] && [ ! -f .next/dev/required-server-files.json ]; then
  echo "[docker-dev] Removing stale .next (next dev expects .next/dev/...)" >&2
  rm -rf .next
fi
exec yarn dev
