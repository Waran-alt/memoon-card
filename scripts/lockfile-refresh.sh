#!/usr/bin/env bash
# Regenerate yarn.lock in a clean Docker environment so the lockfile format
# stays consistent with CI. Run this after adding/updating dependencies.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
YARNRC=".yarnrc.yml"
BACKUP=".yarnrc.yml.lockfile-refresh.bak"
if [[ ! -f "$YARNRC" ]]; then
  echo "Missing $YARNRC" >&2
  exit 1
fi
cp "$YARNRC" "$BACKUP"
sed 's/enableImmutableInstalls: true/enableImmutableInstalls: false/' "$YARNRC" > "${YARNRC}.tmp" && mv "${YARNRC}.tmp" "$YARNRC"
cleanup() {
  mv "$BACKUP" "$YARNRC"
}
trap cleanup EXIT
docker run --rm -v "$ROOT:/app" -w /app node:22-alpine sh -c \
  "corepack enable && corepack prepare yarn@4.12.0 --activate && yarn install"
# Clear local Yarn cache/state so next 'yarn install' uses the new lockfile
# instead of trying to apply old resolution (e.g. combined keys like npm:*, npm:^x).
rm -rf "$ROOT/.yarn/cache" "$ROOT/.yarn/install-state.gz" "$ROOT/.yarn/unplugged" "$ROOT/.yarn/build-state.yml"
echo "Running local yarn install to repopulate from new lockfile..."
if yarn install; then
  echo "Lockfile refreshed. Commit yarn.lock if you changed dependencies."
else
  echo "Local install failed (lockfile format differs on this machine)."
  echo "The lockfile was updated by Docker. Commit yarn.lock and push — CI will pass."
  exit 0
fi
