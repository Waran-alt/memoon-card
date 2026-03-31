#!/usr/bin/env bash
# Run docker compose with merged env files (interpolation only). Order: root → backend → frontend
# (later keys override earlier). Files that are missing are skipped.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

env_args=()
for f in .env backend/.env frontend/.env; do
  if [[ -f "$f" ]]; then
    env_args+=(--env-file "$f")
  fi
done

exec docker compose "${env_args[@]}" "$@"
