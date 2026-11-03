# Deployment

Target: one Linux server (2 vCPU, 4 GB RAM, 40 GB disk is enough for a few
branches; OMR scans grow with use) running Docker Engine 24+ with Compose v2.

## 1. Server preparation

1. Create a non-root deploy user in the `docker` group; disable SSH password
   login; allow only ports 22, 80, 443 in the firewall.
2. Install Docker from the official repository and enable it at boot.
3. Set the server clock to UTC with NTP (business dates are computed in
   Asia/Baku by the application, independent of the host time zone).

## 2. DNS and TLS

1. Create an `A` (and `AAAA` if IPv6) record, e.g. `bilet.example.az`, pointing
   to the server.
2. In `.env` set `SITE_ADDRESS=bilet.example.az` and
   `PUBLIC_URL=https://bilet.example.az`.
3. Caddy obtains and renews Let's Encrypt certificates automatically on first
   start; ports 80 and 443 must be reachable from the internet. Certificates
   live in the `caddy_data` volume — include it in server backups.
4. Behind an existing load balancer that terminates TLS, set
   `SITE_ADDRESS=:80` and restrict port 80 to the load balancer.

## 3. Configuration and secrets

```bash
git clone <repository-url> /opt/hilal && cd /opt/hilal
cp .env.example .env
./scripts/generate-secrets.sh .env     # random POSTGRES_PASSWORD, JWT, QR, OMR worker, admin password
$EDITOR .env                           # PUBLIC_URL, SITE_ADDRESS, BOOTSTRAP_ADMIN_EMAIL
chmod 600 .env
```

Rules enforced at start-up (`apps/api/src/config/env.validation.ts`):

* `JWT_SECRET`, `QR_SIGNING_SECRET`, `OMR_WORKER_SECRET` ≥ 32 characters and
  never a `change-me` placeholder; `QR_SIGNING_SECRET` ≠ `JWT_SECRET`.
* `CORS_ORIGIN` (from `PUBLIC_URL`) must be set.
* Compose refuses to start when a required variable is missing.

Store a copy of `.env` in the organisation's password manager. **Losing
`QR_SIGNING_SECRET` invalidates every printed ticket QR code; rotating it does
the same** (tickets remain usable by code lookup at the desk).

## 4. First start

```bash
docker compose --profile production up -d --build --wait
docker compose --profile production ps        # every service "healthy", migrate "exited (0)"
```

If the stack was ever started before the secrets were generated, Postgres has
already initialised its volume with the placeholder password: run
`docker compose --profile production down -v` (only on a server without data!)
and start again.

Start-up order: `postgres` → `migrate` (runs `prisma migrate deploy`, exits)
→ `worker` → `api` → `web` → `proxy`.

## 5. First administrator

On its first start the API creates a SUPER_ADMIN from
`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (and branch
`BOOTSTRAP_BRANCH_CODE`) **only if no active SUPER_ADMIN exists**. It never
resets an existing account. Then:

1. Sign in at `PUBLIC_URL/login`, change nothing else yet.
2. Delete `BOOTSTRAP_ADMIN_PASSWORD` from `.env` and run
   `docker compose --profile production up -d` (recreates the API without it).
3. Create branches, staff accounts (Filiallar, İşçilər və satıcılar), exams.

## 6. Printers and scanners

* Tickets and receipts are printed from the browser (**Çap et**); use A4 or
  80 mm receipt printers with "fit to page". Test one print per branch.
* Answer sheets are A4 PDFs; print at 100 % scale (no "fit to page"), black
  toner, on white paper. See [OMR.md](OMR.md).
* Door scanning works with any USB/Bluetooth QR scanner in keyboard mode (it
  types the code and presses Enter) or by pasting the code on a phone.

## 7. Updates

```bash
cd /opt/hilal
./scripts/backup.sh backups                       # always before an update
git fetch --tags && git checkout <tag>
docker compose --profile production up -d --build --wait
```

`migrate` applies new migrations before the new API starts. Roll back by
checking out the previous tag; if a migration must be undone, restore the
pre-update backup (see [OPERATIONS.md](OPERATIONS.md)).

A CD template (`.github/workflows/deploy.yml`) automates the same steps over
SSH after manual approval in the GitHub `production` environment.

## 8. Hardening checklist

- [ ] `.env` mode 600, owned by the deploy user, not in git
- [ ] Only 80/443 (and SSH) open; Postgres/worker/API not published
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` removed after first login
- [ ] Off-site copy of `backups/` (see OPERATIONS.md) and of `.env`
- [ ] `API_RATE_LIMIT_PER_MINUTE` sized for the largest office behind one NAT IP
- [ ] Swagger is disabled automatically (`NODE_ENV=production`) and blocked in Caddy
