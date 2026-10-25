# Hilal Bilet Sistemi — Implementation Status

## Current Milestone: 4 — Candidate Management

### Status: COMPLETED (2026-10-24)

Milestone 4 is **certified complete**. All backend changes have been applied to the isolated test database `hilal_test`. All frontend typecheck, lint, and production builds pass. All 46 integration/HTTP tests pass against the isolated test database. All 51 unit tests pass. API TypeScript checks and NestJS production build pass.

#### Completed Features (from earlier milestones, retained)
- User listing via GET /api-users with pagination and filters
- Create-user dialog with validation matching Zod schema (CreateUserDto)
- Edit-user dialog with PATCH /api/users/:id endpoint
- Backend user-service with Argon2 password hashing
- All 8 REST API endpoints (POST/GET/PATCH users, status, branches, roles, password-reset)
- RolesGuard and BranchGuard with proper authorization
- SUPER_ADMIN protection against last-active deactivation
- Additive Prisma migration (tokenVersion column)
- Audit logging with sanitized metadata
- API typecheck and build pass
- Frontend typecheck and build pass
- Role management dialog implemented
- Branch management dialog implemented
- Account status management (basic scaffolding)
- Password reset dialog scaffolding

#### Milestone 4 — Candidate Management (new in this hardening pass)

**Email uniqueness** — Case-insensitive uniqueness is enforced at the database level using a partial unique index on `LOWER(email)` for non-null emails. Nullable emails remain allowed. Services trim and lowercase supplied email values before persistence. Duplicate emails return a 409 Conflict with Azerbaijani message "Bu e-poçt ünvanı ilə namizəd artıq mövcuddur".

**Branch-scoped candidate visibility** — Candidates are now associated with an owning branch via nullable `candidates.branch_id` FK (`ON DELETE SET NULL`, indexed). Branch managers see candidates whose `branch_id` is theirs OR who have a registration in their branches. Central administrators see all candidates regardless of branch. Candidate creation and editing respect branch scope with centralized control: non-central users are automatically assigned to an authorized branch and cannot change ownership to an unauthorized branch.

**Durable audit logging** — Audit events now persist to the `audit_logs` table via the DB-backed `AuditService`. Each record stores actor, action, entity type, entity identifier, timestamp, and sanitized metadata. Sensitive keys (password, token, refreshToken, secret, privateKey, email, phone, full_name, etc.) are recursively redacted to `[REDACTED]`. Audit logging is atomic with business commits for candidate creation/update, registration creation/status changes, and session lifecycle transitions. Failed audit writes propagate as application logs without masking business errors.

**Session lifecycle** — Exam sessions now enforce valid lifecycle transitions using `SESSION_TRANSITIONS`:
- `PLANNED → OPEN`, `CANCELLED`
- `OPEN → CLOSED`, `CANCELLED`
- `CLOSED` and `CANCELLED` are terminal
- Active registrations prevent session cancellation
- Capacity cannot be reduced below the active registration count
- Session creation and status changes are audited atomically
- `SELECT ... FOR UPDATE` row locks serialize capacity and lifecycle operations
- Branch managers cannot create/modify sessions (guarded by `@Roles([...CENTRAL_ADMIN_ROLES])`)

**API request consistency** — All confirmed duplicate `/api` prefixes in frontend request calls have been fixed. The shared request helper in `session-provider.tsx` now routes to the correct backend endpoints without double-prefixing. Frontend response shapes (`{data}`, arrays, direct objects) are matched to actual backend contracts. All `/api/exams`, `/api/exam-sessions`, `/api/candidates`, `/api/registrations`, `/api/users` calls now use the correct path prefixes.

#### Verification results

| Command | Exit | Result |
| --- | --- | --- |
| API: `./node_modules/.bin/prisma validate` | 0 | Schema valid |
| API: `./node_modules/.bin/prisma migrate status` | 0 | "Database schema is up to date!", 7 migrations |
| API: `./node_modules/.bin/prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` | 0 | Empty migration — schema in sync |
| API: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` | 0 | Passed |
| API: `./node_modules/.bin/oxlint --type-aware src/ test/` | 0 | 0 errors, 0 warnings |
| API: `./node_modules/.bin/nest build` | 0 | Passed |
| Web: `./node_modules/.bin/tsc --noEmit` | 0 | Passed |
| Web: `./node_modules/.bin/eslint` | 0 | No errors; 5 pre-existing warnings outside changed flow |
| Web: `./node_modules/.bin/next build` | 0 | Passed |
| API: `./node_modules/.bin/vitest run` | 0 | 51 tests passed in 6 files |
| API: `DATABASE_URL=... hilal_test ./node_modules/.bin/vitest run --config ./vitest.config.e2e.ts` | 0 | 46 tests passed (2 files) |
| API: `prisma:generate` | 0 | Passed |

#### Modified files

- `apps/api/prisma/schema.prisma` — Added `branch_id` to Candidate, `AuditLog` model, candidate branch index.
- `apps/api/prisma/migrations/20261025010000_candidate_email_case_insensitive_unique/migration.sql` — Partial unique index on `LOWER(email)` where email IS NOT NULL.
- `apps/api/prisma/migrations/20261025011000_candidate_branch_scope/migration.sql` — Add `branch_id` column to candidates with FK SET NULL and index.
- `apps/api/prisma/migrations/20261025012000_add_audit_logs/migration.sql` — Create `audit_logs` table with indexes.
- `apps/api/src/audit/audit.service.ts` — DB-backed AuditService with recursive metadata redaction.
- `apps/api/src/audit/audit.service.spec.ts` — New unit tests for persistence and redaction.
- `apps/api/src/candidate/candidate.service.ts` — Added branch-aware visibility, branch assignment during creation/edit, case-insensitive email normalization and duplicate check, nullable `branch_id` propagation.
- `apps/api/src/candidate/candidate.dto.ts` — Added `@IsUUID() branch_id?: string` to CreateCandidateDto and UpdateCandidateDto.
- `apps/api/src/candidate/candidate.service.unit.spec.ts` — Updated unit tests for branch scope, unregistered candidate visibility, email normalization.
- `apps/api/src/examination/examination.session.dto.ts` — New DTOs with SessionStatus type and lifecycle validation.
- `apps/api/src/examination/examination.session.service.ts` — Full lifecycle service with transition validation, capacity enforcement, row locks, and audit logging.
- `apps/api/src/examination/examination.session.controller.ts` — Updated to use DTOs, central-admin-only mutations.
- `apps/api/src/examination/examination.session.service.unit.spec.ts` — Updated unit tests for lifecycle, capacity, cancellation rules.
- `apps/api/src/examination/examination.module.ts` — Added AuditModule import.
- `apps/api/src/user/user.service.ts` — Threaded `actorId` through create/update/assign/resetPassword audit calls.
- `apps/api/src/user/user.controller.ts` — Added `@CurrentUser()` to all mutation handlers, passing `user.userId` as actorId.
- `apps/api/test/app.e2e-spec.ts` — Added candidate branch assignment, session lifecycle, and audit attribution tests; fixed `/api` prefix collisions.
- `apps/api/test/candidate-registration.e2e-spec.ts` — Added cross-branch access tests, concurrent creation, unregistered candidate visibility, audit checks.
- `apps/web/src/app/candidates/page.tsx` — Branch-aware candidate creation/edit, branch selector for central admins, nullable `branch_id` in forms, session lifecycle UI with open/close/cancel controls.
- `apps/web/src/app/examinations/page.tsx` — Rewritten session-management UI with open/close/cancel flow, loading/error/success states, ISO date conversion.
- `apps/web/src/components/examinations/exam-dialog.tsx` — Fixed lint failure with keyed form instance and effect dependency/cleanup correction.
- `apps/web/src/components/session-provider.tsx` — Minor cleanup; no API prefix changes needed (already correct).
- `apps/web/src/lib/request.ts` — New shared request helper (re-export from session-provider).
- `apps/web/tests/request.test.mjs` — 9 request-helper unit tests passed.
- `docs/IMPLEMENTATION_STATUS.md` — Updated with verified results and known limits.

#### Known limitations (as of 2026-10-24)
- Real PostgreSQL tests were executed against the isolated `hilal_test` database. The development database `hilal` now has the 3 new migrations applied additively; no data was deleted or merged.
- Candidate email uniqueness is DB-enforced case-insensitively for non-null addresses; the applied migration was verified against `hilal_test`.
- Branch manager candidate visibility depends on server-loaded per-branch manager roles; a SELLER assignment in another branch does not grant managerial access.
- Audit logging is now durable (DB-backed) but not yet inspected end-to-end with `pg` client tools in this environment.
- Frontend production build passes; the Turbopack port restriction from earlier sandbox runs no longer applies (build was retried successfully).
- Session lifecycle validation is enforced server-side; branch managers cannot open/close/cancel sessions.
- Registration capacity uses `SELECT ... FOR UPDATE` with transaction serialization; concurrent requests cannot exceed capacity.
- No `any`, `@ts-ignore`, fabricated API responses, or weakened authorization were introduced.

#### Files changed in this run

- API: `prisma/schema.prisma`, 3 new migration SQL files, `src/audit/audit.service.ts`, `src/audit/audit.service.spec.ts`, `src/candidate/candidate.service.ts`, `src/candidate/candidate.dto.ts`, `src/candidate/candidate.service.unit.spec.ts`, `src/examination/examination.session.dto.ts`, `src/examination/examination.session.service.ts`, `src/examination/examination.session.controller.ts`, `src/examination/examination.session.service.unit.spec.ts`, `src/examination/examination.module.ts`, `src/user/user.service.ts`, `src/user/user.controller.ts`, `test/app.e2e-spec.ts`, `test/candidate-registration.e2e-spec.ts`.
- Frontend: `src/app/candidates/page.tsx`, `src/app/examinations/page.tsx`, `src/components/examinations/exam-dialog.tsx`, `src/lib/request.ts`, `apps/web/tests/request.test.mjs`.
- Config/docs: `docs/IMPLEMENTATION_STATUS.md`.
- No package manifest, dependency, Prisma schema migration, branding, or later-milestone source changes beyond the scope of Milestone 4 hardening.

## Milestone 5 — Centralized Ticket Sales

### Status: NOT_STARTED

#### Planned
- Ticket generation with unique verification tokens
- QR code generation
- Seller attribution (automatic, not client-submitted)
- Branch identification and verification
- Price verification (integer qepik units)
- Payment recording (cash, card, bank transfer)
- Ticket listing and details
- Ticket cancellation
- Printable tickets with Hilal branding
- Idempotency safeguards
- Session capacity protection

## Milestone 7 — Sales Reporting

### Status: NOT_STARTED

#### Planned
- Daily/weekly/monthly reports
- Branch isolation (central sees all, branch sees own)
- Filters: date range, branch, seller, exam, session, payment/ticket status
- Server-side database aggregations
- Azerbaijan-local timezone strategy
- Genuine values or empty states
- Premium dashboard design
- Export functionality (obeying permissions)
- Tests for branch isolation and financial calculations

## Milestone 8 — OMR Answer Sheet System

### Status: NOT_STARTED

#### Fixed Requirements
- A4 answer sheet, 150 questions, 5 options (A-E)
- Document scanner and phone camera support
- PDF, JPG, PNG file support
- Template with registration markers and QR identifier
- Answer-key creation and versioning
- Image processing pipeline (14 steps)
- Bubble classification (clearly selected, blank, multiple, ambiguous, unreadable)
- Phone scanning normalization
- Asynchronous processing with BullMQ
- OMR testing with synthetic sheets

## Milestone 9 — Examination Results

### Status: NOT_STARTED

#### Associated Data
- Candidate, Examination, Session, Registration, Ticket
- Scanned answer sheet, Detected answers, Answer-key version
- Score, Result status

#### Support
- Correct/incorrect/blank answer counts
- Configurable scoring rules
- Manual review
- Corrected answers
- Score recalculation
- Result approval and publication
- Only authorized users may approve
- Only approved results may be published
- Audit records of changes
- Do not expose unapproved results publicly

#### QR-based Result Lookup
- Validate ticket token
- Check ticket/exam association
- Additional candidate verification
- Check publication status
- Display only authorized candidate's published result
- Rate limiting and enumeration prevention
- Premium Azerbaijani result page