#!/bin/sh
set -e
# Run Liquibase migrations if we have DB env (e.g. in prod); then exec the main command
if [ -n "$POSTGRES_HOST" ] && [ -n "$POSTGRES_DB" ] && [ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_PASSWORD" ]; then
  export LIQUIBASE_COMMAND_URL="jdbc:postgresql://${POSTGRES_HOST}:${POSTGRES_PORT:-5432}/${POSTGRES_DB}"
  export LIQUIBASE_COMMAND_USERNAME="$POSTGRES_USER"
  export LIQUIBASE_COMMAND_PASSWORD="$POSTGRES_PASSWORD"
  (cd /app/migrations && liquibase --changelog-file=changelog.xml update)
fi
exec "$@"
