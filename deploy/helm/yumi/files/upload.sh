#!/bin/sh
set -eu
umask 077

: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_ID:?BACKUP_ID is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_PREFIX:?S3_PREFIX is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"

if [ "${S3_FORCE_PATH_STYLE:-true}" = true ]; then
  aws configure set default.s3.addressing_style path
fi
set --
if [ -n "${S3_ENDPOINT:-}" ]; then
  set -- --endpoint-url "$S3_ENDPOINT"
fi
destination="s3://$S3_BUCKET/$S3_PREFIX/$(date -u +%Y-%m-%dT%H-%M-%SZ)-$BACKUP_ID"
# The checksum is the completion marker; publish it only after a successful dump
# upload. A failed job must never advertise a restorable backup.
aws "$@" s3 cp "$BACKUP_DIR/database.dump" "$destination/database.dump" --only-show-errors
aws "$@" s3 cp "$BACKUP_DIR/database.dump.sha256" "$destination/database.dump.sha256" --only-show-errors
echo "Backup complete: $destination"
