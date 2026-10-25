# UI redesign verification

Date: 2026-10-23. No deployment or database changes.

## Results

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: attempted; `pnpm: command not found`.
- Offline Corepack could not provide pnpm because registry access is unavailable.
- Installed TypeScript binaries: web, API, and shared checks passed.
- Installed ESLint: no errors; one pre-existing unused `children` warning in `components/ui/checkbox.tsx`.
- Static checks: official logo matches attachment byte-for-byte; all navigation targets exist; main text/status pairs exceed 4.5:1 and input borders exceed 3:1 contrast.
- Installed Tailwind loader: complete stylesheet compiled successfully without a server.
- Authentication contract tests: 14 passed, using intercepted fetch responses, real response parsing, and token-expiry checks. No database writes.
- Default `next build`: failed because Turbopack's CSS loader process cannot bind a port in this sandbox (`Operation not permitted`). This is not a successful production build.
- `next dev --hostname 127.0.0.1 --port 3187`: failed with `listen EPERM`.
- Playwright browser launch: blocked by Chromium's `setsockopt: Operation not permitted`. No screenshots, overflow checks, keyboard interaction checks, or browser runtime success are claimed.
- Existing API unit command: no test files found.
- Existing API E2E suite: failed on unresolved `express` import before any tests ran.

## Local preview

From the repository root, without requiring pnpm:

```bash
npm --prefix apps/web run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/login` or `http://127.0.0.1:3000/dashboard`.

The same-origin API proxy uses `API_ORIGIN`, defaulting to `http://127.0.0.1:3001`. A working backend is required for real login and branch operations. The existing backend Prisma initialization and security defects documented in the Phase 2 audit are unchanged.

With pnpm installed:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Authentication contract tests require Node.js 22 with type stripping:

```bash
node --experimental-strip-types apps/web/tests/auth.test.mjs
```

Browser integration tests use synthetic API fixtures and do not write to a database. With the frontend running on port 3000 and Python Playwright available:

```bash
BROWSER_BASE_URL=http://127.0.0.1:3000 python3 apps/web/tests/browser.py
```

The browser script covers 375px, 768px, 1280px, and 1728px widths; login errors and password visibility; sidebar navigation; branch search, pagination, creation, editing and confirmation; honest placeholders; memory-only session behavior; and client runtime errors. It writes screenshots to `/tmp/hilal-ui-screenshots`. Its assertions have not run in this restricted environment.

## Remaining product limits

- UI role restrictions do not secure the API. Backend RBAC and branch isolation remain required.
- Logout clears only this browser's in-memory session. The API has no revocation endpoint.
- Reloading the document ends the local session. Persistent-login control is visibly disabled.
- The branch list API exposes only active records. Pagination and contact filters run on the loaded active records.
- Deactivation requires confirmation and warns that inactive records cannot be listed with the current API.
- User management and the other unfinished modules remain explicit placeholders.
- No fabricated metrics or charts were added.

## V2 refinement verification

- New baseline screenshots were not attached to the V2 message; the existing source and official logo were used as the baseline.
- Web TypeScript: passed. Frontend lint: passed with the same pre-existing checkbox warning. Authentication/form tests: all 14 passed.
- The full Tailwind stylesheet compiled successfully using the installed loader.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` were attempted again; pnpm remains unavailable.
- Production build was attempted using the installed Next.js binary. Turbopack failed while attempting to bind a port for the CSS loader process (`Operation not permitted`).
- Browser tests were attempted again. Chromium failed at launch with `setsockopt: Operation not permitted`; no desktop/mobile screenshots or horizontal-overflow results are claimed.
- Main navigation targets and the unchanged official logo are checked statically. Text and input-border contrast are calculated from the CSS tokens.
- V2 changes: `globals.css`, login page, dashboard page, `app-shell.tsx`, the browser test's upcoming-module accessible name, `DESIGN.md`, and this document. No authentication, backend, schema, dependency, or logo changes.

## Milestone 4 verification (2026-10-24)

Scope: Candidate Management and examination registration hardening. No work was started on ticket sales, payments, QR, reporting, or OMR.

### Environment and safety

- Isolated integration database: `hilal_test` (database name ends with `_test`).
- All four existing migrations applied to `hilal_test` with `prisma migrate deploy`.
- Integration and HTTP tests set `DATABASE_URL` and `TEST_DATABASE_URL` to `hilal_test`; test files refuse to run against a database name that does not end with `_test`.
- The development database `hilal` was inspected read-only and was not reset or seeded.
- Prisma schema was aligned to the already-applied database state. `prisma migrate diff` reports an empty migration; no new migration was added.

### Commands and results

Prisma:

```bash
cd apps/api
./node_modules/.bin/prisma validate
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate status
./node_modules/.bin/prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code
```

- validate: passed.
- generate: passed.
- migrate status: "Database schema is up to date!", 4 migrations.
- migrate diff: exit 0, "This is an empty migration."

API:

```bash
cd apps/api
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/oxlint --type-aware src/ test/
./node_modules/.bin/nest build
```

- TypeScript: passed.
- oxlint: passed, 0 errors, 0 warnings.
- Nest build: passed.

Frontend:

```bash
cd apps/web
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/app/candidates/page.tsx src/components/session-provider.tsx src/lib/auth.ts
./node_modules/.bin/next build
```

- TypeScript: passed.
- ESLint (changed files): passed.
- Next production build: passed.

Tests:

```bash
# Unit tests (mocked Prisma, no database)
cd apps/api
./node_modules/.bin/vitest run

# Database integration and HTTP e2e tests (isolated test database)
DATABASE_URL=postgresql://hilal:hilal@localhost:5432/hilal_test \
TEST_DATABASE_URL=postgresql://hilal:hilal@localhost:5432/hilal_test \
./node_modules/.bin/vitest run --config ./vitest.config.e2e.ts
```

- Unit tests: 5 files, 41 tests passed.
- Integration/HTTP e2e tests: 2 files, 24 tests passed.
- Unit tests use mocked Prisma and do not touch a database.
- Integration tests use real PostgreSQL in `hilal_test`.

### What the tests prove

- Real login with seeded `SUPER_ADMIN`, `SELLER`, and `BRANCH_MANAGER` users succeeds against the test database.
- Requests without a token receive 401.
- A `SELLER` receives 403 when creating or listing candidates and registrations.
- A branch manager sees only candidates and registrations linked to their authorized branch; another branch returns 404 for details.
- Candidate creation persists a server-generated unique number; duplicate email is rejected by the service.
- Candidate search and pagination return real persisted data.
- Registration succeeds for an `OPEN` session, and a session belonging to another exam is rejected.
- Closed sessions reject new registrations.
- Duplicate `(candidate_id, session_id)` registration is rejected by the service and by the database unique index.
- Two concurrent registrations for a session with capacity 1 produce exactly one active registration.
- Cancellation sets status to `CANCELLED`, keeps the row, frees capacity, and preserves history.
- Deleting a referenced candidate or session is blocked by `ON DELETE RESTRICT`.
- Invalid status transitions (for example `CANCELLED` to `ACTIVE` through the update endpoint) are rejected.
- Direct SQL inspection confirmed the unique indexes and foreign-key delete actions listed in `docs/IMPLEMENTATION_STATUS.md`.

### Known verification limits

- The vitest run prints a non-fatal Vite config-loader ESM warning. Tests pass and the warning does not affect results.
- Browser automation was not run for the candidate page; frontend verification is typecheck, lint, production build, and source inspection.
- Audit logs are in-memory and console-based, not durable.
- Candidate email uniqueness is enforced only in service logic because the applied database has no unique email index.

### Runtime smoke (built artifacts)

- `next start -p 3100` started successfully; `GET /candidates` returned HTTP 200 and the rendered HTML contained "Namizədlər".
- Built API (`node dist/main.js`, `PORT=3101`, test database) started successfully.
- `GET /api/health` returned HTTP 200 with `{"status":"ok","database":"connected"}`.
- Real login with a seeded `SUPER_ADMIN` user returned a JWT; `GET /api/candidates` with it returned HTTP 200 and a paginated response.
- `GET /api/candidates` without a token returned HTTP 401.
- Test-isolation fix: the integration suite now upserts its branch instead of deleting all branches, so it no longer cascades away role assignments seeded by the HTTP e2e suite.
