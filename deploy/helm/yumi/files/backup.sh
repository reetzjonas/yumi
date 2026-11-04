#!/bin/sh
set -eu
umask 077

: "${BACKUP_DIR:?BACKUP_DIR is required}"
# libpq accepts a connection URI in PGDATABASE. Bundled PostgreSQL uses PG* env.
if [ -n "${DATABASE_URL:-}" ]; then
  export PGDATABASE="$DATABASE_URL"
fi
pg_dump --format=custom --no-acl --file="$BACKUP_DIR/database.dump"
pg_restore --list "$BACKUP_DIR/database.dump" > /dev/null
(
  cd "$BACKUP_DIR"
  sha256sum database.dump > database.dump.sha256
)
echo "Database dump and checksum ready"
