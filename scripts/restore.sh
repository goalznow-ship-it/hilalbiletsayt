#!/usr/bin/env sh
# Restores a backup made by scripts/backup.sh into the running stack.
# DESTRUCTIVE: replaces the whole database and the OMR scan volume.
# Usage: ./scripts/restore.sh <backup-dir> <UTC stamp> --yes
#   e.g. ./scripts/restore.sh backups 20261104T010203Z --yes
set -eu
dir="${1:?backup dir}"; stamp="${2:?backup stamp}"
[ "${3:-}" = "--yes" ] || { echo "Refusing to restore without --yes (this replaces all data)." >&2; exit 1; }
db="$dir/hilal-db-$stamp.dump"; omr="$dir/hilal-omr-$stamp.tar.gz"; sums="$dir/hilal-$stamp.sha256"

echo "Verifying checksums…"
( cd "$dir" && { command -v sha256sum >/dev/null && sha256sum -c "$(basename "$sums")" \
  || shasum -a 256 -c "$(basename "$sums")"; } )

echo "Stopping writers (web, api)…"
docker compose stop web api

echo "Recreating database…"
docker compose exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" --force --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
# --disable-triggers: closed business days are frozen by triggers that would
# otherwise reject re-inserting their tickets. Requires the superuser that the
# postgres image creates (POSTGRES_USER).
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --disable-triggers --single-transaction --exit-on-error' < "$db"

echo "Restoring OMR scans…"
docker compose run --rm --no-deps -T --entrypoint sh api \
  -c 'find /var/lib/hilal/omr -mindepth 1 -delete && tar -C /var/lib/hilal/omr -xzf -' < "$omr"

echo "Applying newer migrations (if any) and starting the API…"
docker compose run --rm migrate
docker compose start api web
echo "Restore of $stamp complete."
