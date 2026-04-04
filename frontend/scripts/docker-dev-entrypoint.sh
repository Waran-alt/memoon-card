#!/bin/sh
# Dev stack (docker-compose.yml): host bind-mounts ./frontend over /app/frontend. A production
# .next from `yarn build`, a partial .next, or root-owned leftovers break Next 16 dev (ENOENT on
# .next/dev/required-server-files.json, routes-manifest.json, …).
set -e
cd /app/frontend
if [ -d .next ]; then
  if [ ! -f .next/dev/required-server-files.json ] || [ ! -f .next/dev/routes-manifest.json ]; then
    echo "[docker-dev] Removing incomplete or stale .next (next dev needs .next/dev/* manifests)" >&2
    rm -rf .next
  fi
fi
exec yarn dev
