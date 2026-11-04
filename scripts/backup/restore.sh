#!/bin/sh
set -eu

: "${DATABASE_URL:?Set DATABASE_URL to an existing, empty restore database}"
if [ "$#" -ne 1 ]; then
  echo "Usage: DATABASE_URL=postgresql://... sh scripts/backup/restore.sh /path/database.dump" >&2
  exit 2
fi
pg_restore --list "$1" > /dev/null
pg_restore --dbname="$DATABASE_URL" --no-owner --no-acl --exit-on-error --single-transaction "$1"
