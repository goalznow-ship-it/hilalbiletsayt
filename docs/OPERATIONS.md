# Operations

All commands run from the repository root on the server.

## Daily routine

| When | Who | What |
| --- | --- | --- |
| Opening | Seller | Sign in, check the branch selector shows the right branch |
| During the day | Seller | Sell (Bilet kassası), take cash (Ödənişi təsdiqlə), print tickets |
| Closing | Branch manager | **Günün bağlanması → Günü bağla**: totals are frozen |
| Exam day | Door staff | **Girişdə yoxlama**: scan each ticket QR once |
| After the exam | OMR operator | Issue/scan answer sheets, clear the review queue |
| Results | Central admin | **Nəticələr → Dərc et** once the review queue is empty |

### Day closure semantics

* A business day is a calendar date in Asia/Baku time (UTC+4) per branch.
* Closing records the totals (tickets, paid, pending, cancelled, cash in
  qəpik, per seller) in `business_day_closures` and audit logs.
* After closing, PostgreSQL triggers reject for that branch and date: new
  sales, payment confirmation, cancellation, price/owner changes and deletion.
  Admission at the door (ACTIVE → USED) stays allowed.
* Closures cannot be edited or deleted. A mistake is corrected on a later day
  (e.g. a refund) and explained in writing; there is no "reopen".

### Results publication

* Publishing requires: no pages in the review queue, no upload still
  processing, at least one completed result.
* While published, OMR uploads and manual reviews for the exam are refused;
  hide (Gizlət) the results first, correct, publish again. Each step is audited.

## Backups

```bash
./scripts/backup.sh backups
```

Writes `hilal-db-<UTC>.dump` (pg_dump custom format), `hilal-omr-<UTC>.tar.gz`
(OMR scan originals) and a SHA-256 manifest. Recommended schedule (cron as the
deploy user):

```cron
15 2 * * * cd /opt/hilal && ./scripts/backup.sh backups >> backups/backup.log 2>&1
45 2 * * * find /opt/hilal/backups -name 'hilal-*' -mtime +14 -delete
```

Copy `backups/` off the server daily (object storage, another site). Keep a
copy of `.env` separately: the dump is useless for QR verification without
`QR_SIGNING_SECRET`, and `caddy_data` holds TLS certificates.

## Restore

```bash
./scripts/restore.sh backups 20261104T021500Z --yes
```

The script verifies checksums, stops `web` and `api`, recreates the database,
restores it with `--disable-triggers` (closed days must be re-inserted as they
were), restores the OMR volume, runs pending migrations and restarts.
Downtime is roughly one minute per GB of dump.

### Restore drill

Run quarterly on a staging copy (never on production with live sales):

```bash
./scripts/backup-restore-drill.sh
```

It fingerprints tickets, closures, users, OMR pages, audit logs, migrations and
the OMR files, backs up, restores, and fails unless all fingerprints match.

## Monitoring

* `docker compose --profile production ps` — every service must be `healthy`.
* `GET /api/health` (inside the network) reports database connectivity; the
  proxy health check covers the web path.
* Logs: `docker compose logs -f api web worker proxy`. Audit events (sales,
  payments, cancellations, closures, OMR reviews, publication) are in the
  `audit_logs` table with sensitive fields redacted.
* Disk: watch the `postgres_data` and `omr_data` volumes;
  `OMR_MAX_STORAGE_BYTES` (default 2 GiB) caps stored scans.

## Incidents

| Symptom | Check | Action |
| --- | --- | --- |
| API restarts with "Invalid environment configuration" | `docker compose logs api` | Fix `.env` (placeholders, missing secret) |
| `migrate` exited non-zero | `docker compose logs migrate` | Fix the migration or restore the pre-update backup |
| Many 429 responses from one office | office NAT IP | Raise `API_RATE_LIMIT_PER_MINUTE` |
| QR codes "not found" everywhere | `QR_SIGNING_SECRET` changed | Restore the previous secret from the password manager |
| OMR uploads fail with 503 | `docker compose ps worker`, logs | Restart worker; uploads can be retried (stored originals) |
| "Sessiya kapasitəsi doldurulub" | session capacity | Expected; capacity is enforced in the database |

## Secrets rotation

* `JWT_SECRET`: rotate any time; all users must sign in again.
* `OMR_WORKER_SECRET`: rotate any time; restart `api` and `worker` together.
* `QR_SIGNING_SECRET`: rotating invalidates every issued ticket QR. Only do it
  after a suspected leak, and re-print tickets for upcoming exams.
* `POSTGRES_PASSWORD`: change inside Postgres (`ALTER USER`) first, then `.env`.
