#!/bin/sh
set -e
# Prod/staging: run Liquibase using POSTGRES_* env, then exec CMD (e.g. node dist).
# LIQUIBASE_* below mirrors the app DB credentials; not baked into the image as literals.
# Changelog: /app/migrations. If POSTGRES_* is unset, skip migrate (e.g. bare local node).
if [ -n "$POSTGRES_HOST" ] && [ -n "$POSTGRES_DB" ] && [ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_PASSWORD" ]; then
  export LIQUIBASE_COMMAND_URL="jdbc:postgresql://${POSTGRES_HOST}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}"
  export LIQUIBASE_COMMAND_USERNAME="$POSTGRES_USER"
  export LIQUIBASE_COMMAND_PASSWORD="$POSTGRES_PASSWORD"
  (cd /app/migrations && liquibase --changelog-file=changelog.xml update)
fi
exec "$@"
