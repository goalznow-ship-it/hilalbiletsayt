# Hilal Bilet Sistemi — Implementation Status

Updated: 2026-11-04. Scope of this pass: sections 5–7 of the specification
(tests, CI, documentation, Definition of Done, reporting). **Sections 1–4 of
the original specification are not in the repository and were not used**;
requirements that only they define are not verified here.

Earlier status texts (milestones 4–6, "M8 OMR NOT_STARTED") were outdated and
have been replaced by this file; the git history keeps them.

## Definition of Done

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | First admin from environment | PASS | `BootstrapAdminService` (`BOOTSTRAP_ADMIN_*`, advisory lock, never overwrites); e2e `dod.e2e-spec.ts` "first administrator" (2 parallel bootstraps → one admin, login works); production stack log "First SUPER_ADMIN created" |
| 2 | Seller of branch A sells, does not see branch B | PASS | `getSalesBranchIds` scoping in `TicketService`; e2e "branch-isolated seller sales" (list/detail/code/payment/stats/sell/candidate → 403/404 across branches); Playwright smoke step 1 |
| 3 | Concurrent sales never exceed capacity, no duplicates | PASS | Migration `20261103000000_dod_hardening`: capacity trigger under row lock + partial unique index; e2e: 20 parallel → 5/5 seats, 10 parallel same candidate → 1 ticket, raw inserts rejected by the DB; load test 600 req/64 conn → 50/50, 0 duplicates (local and production stack) |
| 4 | QR cannot be forged | PASS | HMAC-SHA256 `<token>.<sig>` (`common/qr-signature.ts`); unit tests (altered, foreign, wrong key, malformed); e2e forged → 404/400 |
| 5 | Closing the day freezes data | PASS | `business_day_closures` (append-only) + freeze trigger; e2e: sale/payment/cancel → 409, raw UPDATE/DELETE rejected, admission still allowed, other branch unaffected; Playwright step 7; trigger active after restore |
| 6 | Scanned sample sheet gives the correct result | PASS | Fixture `clean.png` → worker READ with expected answers (pytest) → snapshot scored by API (`omr.fixture.unit.spec.ts`, 27.5/40); Playwright: real worker PDF → review → score 2/3 |
| 7 | Doubtful sheets go to the review queue | PASS | Fixtures blurry / double-marked / blank → REVIEW (pytest); new `ALL_BLANK` rule; existing faint-mark/QR/identity rules; Playwright step 4 |
| 8 | A ticket cannot be scanned twice | PASS | Atomic `updateMany` ACTIVE→USED; `POST /ticket/scan`; e2e 5 concurrent scans → 1×201, 4×409; OMR duplicate sheet → `DUPLICATE` (existing tests); Playwright step 3 |
| 9 | Unpublished results are hidden | PASS | `exams.results_published_at`; publish requires empty review queue; OMR changes blocked while published; e2e lookup 404 before publish / after unpublish; Playwright step 6 |
| 10 | Public result page with rate limit and brute-force protection | PASS | `/results` page, `POST /public/results/lookup` (ticket + candidate number, constant-time compare, identical 404), 10/min/IP; e2e 11th/12th → 429; production stack: per-client limit through proxy chain, spoofed `X-Forwarded-For` ignored |
| 11 | No unsafe defaults, secrets required in production | PASS | env validation rejects missing/placeholder secrets, same JWT/QR secret, missing CORS; compose has no secret defaults; production start with `.env.example` placeholders fails fast (verified); Swagger off in production and blocked in Caddy; only the proxy publishes ports |
| 12 | Fresh clone → production profile healthy | PASS (with one documented step) | clone → `cp .env.example .env` → `./scripts/generate-secrets.sh .env` → `docker compose --profile production up -d --build --wait` → all 7 services healthy/exited 0 in ~30 s. The secret generation step is intentional: a plain copy of the template must not produce a running production system |
| 13 | Migrations apply cleanly | PASS | 15 migrations on an empty DB (local, CI config, stack); `prisma migrate diff … --exit-code` = 0 (schema drift found and fixed: missing unique `tickets.code`) |
| 14 | Backup and restore tested | PASS | `scripts/backup-restore-drill.sh` on the production stack with sales, a closed day, OMR scan and published results: fingerprints of tickets, closures, users, OMR pages, audit logs, migrations and scan files identical |
| 15 | CI pipeline | PARTIAL | `.github/workflows/ci.yml` written and YAML-validated; **not executed on GitHub** (no push allowed in this pass). Every step was run locally with the commands below |
| 16 | Accessibility / mobile on seller and scan screens | PASS | Playwright + axe (WCAG 2.1 A/AA) on 7 screens × desktop/Pixel 7, no horizontal overflow, 44 px touch target on mobile: 16/16 |

## Verification (2026-11-04, local machine, PostgreSQL 16 in Docker)

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 0 | |
| `pnpm typecheck` | 0 | api, web, shared |
| `pnpm lint` | 0 | 0 errors; pre-existing warnings only |
| `pnpm --filter @hilal/api test` | 0 | 20 files, 113 tests |
| `pnpm --filter @hilal/api test:e2e` (`*_test` DB) | 0 | 6 files, 82 tests (13 new DoD tests) |
| `pnpm --filter @hilal/web test` | 0 | 39 tests |
| `pnpm build` | 0 | api + web |
| OMR `pytest` in `python:3.12-slim` worker image | 0 | 20 tests (6 new fixture tests) |
| `pnpm audit --prod` | 0 | no known vulnerabilities (multer patched to 2.5.0) |
| `pnpm --filter @hilal/e2e load` (production stack) | 0 | 600 requests → 50 tickets for 50 seats, 0 duplicates |
| `pnpm --filter @hilal/e2e smoke` (production stack) | 0 | 24 tests (8 smoke + 16 a11y) |
| `docker compose --profile production up -d --build --wait` (fresh clone) | 0 | 7 services healthy / migrate exited 0 |
| `./scripts/backup-restore-drill.sh` | 0 | DRILL PASSED |

## New in this pass

* Migration `20261103000000_dod_hardening`: role seeds, live-ticket unique
  index, capacity trigger, business-day closure table and freeze triggers,
  result publication columns, unique ticket code / QR, FK actions.
* API: seller sales/payment/buyer registration scoped by branch, signed QR,
  `POST /ticket/scan`, `/day-closures`, `/results` + public lookup, bootstrap
  admin, production env rules, configurable rate limits, crypto-random
  candidate numbers, runtime dependencies declared correctly.
* Web: role-based navigation, entry scan, day closure, results publication,
  public result page, OMR screens enabled by default, accessibility fixes.
* OMR: committed scan fixtures, worker→API contract test, `ALL_BLANK` review.
* Tests: DoD e2e suite, autocannon load test, Playwright smoke + axe.
* Ops: production compose profile with Caddy, migrate service, backup /
  restore / drill scripts, CI and CD template, documentation and guides.

## Known limitations and risks

* **CI has not run on GitHub.** First push will be its first execution.
* Redis is in the stack but unused; OMR processing is synchronous (no queue).
* RustFS/S3 storage was removed from compose because the code never used it;
  OMR scans live on a Docker volume (back it up with `scripts/backup.sh`).
* OMR fixtures are synthetic renders; real printer/scanner/phone samples from
  each branch must be validated before the first live exam.
* Reports are limited to `/ticket/stats` and day closures (no date-range
  reports per seller yet — Milestone 7 of the old plan).
* There is no separate "approve" step: publication by a central admin is the
  approval. Unpublishing is possible and audited.
* Login rate limit (10/min/IP) and API limit are per client IP: offices behind
  one NAT address share them.
* Full `pnpm audit` (including build/test tooling) reports 27 advisories
  (8 high) in development dependencies; production dependencies are clean.
* OMR worker tests do not run on macOS (`RLIMIT_AS`); use Linux or the image.
* Users created by administrators still accept 6-character passwords
  (pre-existing rule); the bootstrap admin requires 12.

## Manual steps on a real server

See [DEPLOYMENT.md](DEPLOYMENT.md): DNS record, `SITE_ADDRESS`/`PUBLIC_URL`
for automatic TLS, `generate-secrets.sh` and a password-manager copy of
`.env`, first admin login and removal of `BOOTSTRAP_ADMIN_PASSWORD`, printer
test prints (tickets: browser print; answer sheets: 100 % A4), a real-scan OMR
calibration batch, daily off-site backups and a quarterly restore drill,
GitHub `production` environment secrets for the CD template.
