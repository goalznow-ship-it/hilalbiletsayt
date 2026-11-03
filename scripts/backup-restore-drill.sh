#!/usr/bin/env sh
# Disaster-recovery drill against a running stack: fingerprint the data,
# back up, restore into a freshly recreated database, compare fingerprints.
# Usage: ./scripts/backup-restore-drill.sh   (exit 0 = identical after restore)
set -eu
dir="${BACKUP_DIR:-backups}"

fingerprint() {
  docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -AtX' <<'SQL'
SELECT 'tickets', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM tickets t
UNION ALL SELECT 'business_day_closures', count(*), md5(coalesce(string_agg(c::text, '|' ORDER BY id), '')) FROM business_day_closures c
UNION ALL SELECT 'users', count(*), md5(coalesce(string_agg(u::text, '|' ORDER BY id), '')) FROM users u
UNION ALL SELECT 'omr_pages', count(*), md5(coalesce(string_agg(p::text, '|' ORDER BY id), '')) FROM omr_pages p
UNION ALL SELECT 'audit_logs', count(*), md5(coalesce(string_agg(a::text, '|' ORDER BY id), '')) FROM audit_logs a
UNION ALL SELECT 'migrations', count(*), md5(coalesce(string_agg(migration_name, '|' ORDER BY migration_name), '')) FROM _prisma_migrations;
SQL
  docker compose run --rm --no-deps -T --entrypoint sh api -c \
    'cd /var/lib/hilal/omr && find . -type f | sort | xargs -r sha256sum | sha256sum'
}

before="$(fingerprint)"
echo "Before:"; echo "$before"
./scripts/backup.sh "$dir"
stamp="$(ls -1 "$dir"/hilal-*.sha256 | sort | tail -1 | sed 's/.*hilal-\(.*\)\.sha256/\1/')"
./scripts/restore.sh "$dir" "$stamp" --yes
docker compose up -d --wait api web
after="$(fingerprint)"
echo "After:"; echo "$after"
if [ "$before" = "$after" ]; then echo "DRILL PASSED: data identical after restore ($stamp)"; else echo "DRILL FAILED"; exit 1; fi
