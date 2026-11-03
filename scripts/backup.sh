#!/usr/bin/env sh
# Backs up the PostgreSQL database and the OMR scan volume of the running stack.
# Usage: ./scripts/backup.sh [backup-dir]        (default: ./backups)
# Output: hilal-db-<UTC>.dump (pg_dump custom format), hilal-omr-<UTC>.tar.gz,
#         hilal-<UTC>.sha256 (checksums). Run from the repository root.
set -eu
dir="${1:-backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dir"
umask 077

db="$dir/hilal-db-$stamp.dump"
omr="$dir/hilal-omr-$stamp.tar.gz"

docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' > "$db"
docker compose run --rm --no-deps -T --entrypoint tar api \
  -C /var/lib/hilal/omr -czf - . > "$omr"

( cd "$dir" && { command -v sha256sum >/dev/null && sha256sum "$(basename "$db")" "$(basename "$omr")" \
  || shasum -a 256 "$(basename "$db")" "$(basename "$omr")"; } ) > "$dir/hilal-$stamp.sha256"

echo "Backup written:"
ls -l "$db" "$omr" "$dir/hilal-$stamp.sha256"
