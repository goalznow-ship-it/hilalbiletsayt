# HILAL BİLET SİSTEMİ — MILESTONE 4 FINAL HARDENing RAPORU

## tarix: 2026-10-24

### əməliyyat statusı
Milestone 4 (Candidate Management and Registration) tamamlanıb və certifika edilmişdir. Bütün backend proqramlığı, Prisma və migrations, API tipekontrolı, lint, build və PostgreSQL integrasiya testləri successfully icra edilmişdir.

### əməliyyatlar

#### 1. e-poçt einziglik politikası
- **DB-enforced case-insensitive uniqueness**: `candidates` sisteri `LOWER(email)` partially unique index `(WHERE email IS NOT NULL)`. Boş e-poçtlar qorunub.
- **Servis normalizasiya**: Artıq daxil edilən e-poçtlar `.trim().tolowerCase()` ilə hazırlanır, bu da əksinəri qaytupları blokla.
- **Xəta mesajı**: `"Bu e-poçt ünvanı ilə namizəd artıq mövcuddur"` (409 Conflict).
- **Migrations**: `20261025010000_candidate_email_case_insensitive_unique` migrations `hilal_test` DB-ye applied. `prisma migrate diff` boş cavab verdi (schema actual).
- **Unit test**: Duplicate/unicode email create testlər keçdi.

#### 2. Filialla bağlı görgülük (branch-scoped candidate visibility)
- **Nullable `candidates.branch_id`**: `UUID`, `ON DELETE SET NULL`, indexed.
- **Central admins**: Bütün candidate-lara baxa Baxa bilərlər.
- **Branch managers**: Branch assigned candidate-lara və ya o branch-inə qeydiyyatdan keçmiş registration-lara baxa Baxa bilərlər.
- **Creation/Edit**: Non-central users avtomatik olaraq yetkilendirilen branch-a müəyyən olunur; yanlış branch seçimi reddedilir. Central `branch_id` dəyişməyi oxuya bilər.
- **Migration**: `20261025011000_candidate_branch_scope` — column əlavə, FK, index.
- **Unit test**: Unregistered candidate visibility, cross-branch access, manager branch assignment testlər keçdi.

#### 3. Dayanıq audit qeydiyyatı (durable audit logging)
- **`audit_logs` table**: `id`, `actorId`, `action`, `entityType`, `entityId`, `metadata` (JsonB), `timestamp`.
- **Recursive redaction**: Parol, token, secret, email, phone, full_name və yaxud digər sensitive keylər `[REDACTED]` iləinə əvəz olunur.
- **Atomic tx**: Candidate create/update, registration create/cancel, session transition-lar əlavə tx-də baş qaldı. Audit səzlənmədiyinə görə business error göstərilib.
- **Migration**: `20261025012000_add_audit_logs` — table, tre indexes.
- **Unit test**: Persistence və redaction pattern testlər keçdi.

#### 4. İmtahan sesi life cycle (examination session lifecycle)
- **Valid transitionlar**:
  - `PLANNED → OPEN`, `CANCELLED`
  - `OPEN → CLOSED`, `CANCELLED`
  - `CLOSED`/`CANCELLED` terminal status
- **Aktiv qeydiyyatlar**: Sesi ləğv etməyə görə RED - `activeCount > 0` bəskin.
- **Kapasitet**: Əlavə capacity RED-edərək aktiv qeydiyyat sayından az ola bilməz.
- **Row lock**: `SELECT ... FOR UPDATE` tx-lər capacity və lifecycle operation-lari serialize edir.
- **Audit**: Session create/status change-lar audit_logs-da yozulur.
- **Branch manager**: Sesi create/close/cancel etmək @Roles(`[...CENTRAL_ADMIN_ROLES]`) vasitəsilə bloklanır.
- **Migration**: Examination session lifecycle/migrations mövcuddur, `prisma migrate status` "up to date" qaytarır.

#### 5. API request consistency (API sirova everywhere consistency)
- **Duplicate `/api` prefix-lər**: Barcha frontend `/api/candidates`, `/api/exams` və s. yol yolğandır; onlar rectifika edildi, `request()` helper `/candidates`, `/exams`, `/branches`, `/users`, `/registrations` rutasiyaları artıq backend routed-lar ile consistently istifadə edilir.
- **Response shape**: `{data}` arrays, və ya doğrudan objectContractlar backend agreementinə uyğun olarak frontend-də düzəliş edilib.
- **Unit test**: 9 request-helper unit testləri keçdi.

#### 6. Final verification (testlər)
- **Unit tests**: 51 test, 6 file, exit 0.
- **Integration/HTTP tests**: 46 test, 2 file (hilal_test DB), exit 0.
- **Prisma validate**: 0, generate: 0, migrate status: "up to date", diff: empty migration.
- **API TypeScript**: 0 (pass).
- **API oxlint**: 0 errors, 0 warnings.
- **API nest build**: 0 (pass).
- **Web tsc**: 0 (pass).
- **Web eslint**: 0 errors (pre-existing 5 warnings outer changed flow).
- **Web next build**: 0 (pass).
- **Auth form tests**: 14 passed (node --experimental-strip-types).
- **Request helper tests**: 9 passed.

### dəyişən fayllar

**API (Prisma & Schema)**:
- `apps/api/prisma/schema.prisma` — Candidate branch_id, AuditLog model
- `apps/api/prisma/migrations/20261025010000_candidate_email_case_insensitive_unique/migration.sql`
- `apps/api/prisma/migrations/20261025011000_candidate_branch_scope/migration.sql`
- `apps/api/prisma/migrations/20261025012000_add_audit_logs/migration.sql`

**API (source code)**:
- `apps/api/src/audit/audit.service.ts` — DB-backed AuditService redaction
- `apps/api/src/audit/audit.service.spec.ts` — Unit tests
- `apps/api/src/candidate/candidate.service.ts` — Branch-aware, email normalize
- `apps/api/src/candidate/candidate.dto.ts` — branch_id field
- `apps/api/src/candidate/candidate.service.unit.spec.ts` — Branch tests
- `apps/api/src/examination/examination.session.dto.ts` — SessionStatus DTO
- `apps/api/src/examination/examination.session.service.ts` — Lifecycle service
- `apps/api/src/examination/examination.session.controller.ts` — Central-admin guards
- `apps/api/src/examination.examination.session.service.unit.spec.ts` — Lifecycle tests
- `apps/api/src.examination.examination.module.ts` — AuditModule
- `apps/api/src.user.user.service.ts` — actorId threading
- `apps/api/src.user.user.controller.ts` — @CurrentUser() on mutations
- `apps/api/test/app.e2e-spec.ts` — Session lifecycle, audit, cross-branch tests
- `apps/api/test/candidate-registration.e2e-spec.ts` — Duplicate email, branch scope, audit

**Frontend**:
- `apps/web/src/app/candidates/page.tsx` — Branch forms, session lifecycle UI
- `apps/web/src/app/examinations/page.tsx` — Session open/close/cancel UI
- `apps/web/src/components/examinations/exam-dialog.tsx` — Lint fix
- `apps/web/src/lib/request.ts` — Shared request helper
- `apps/web/tests/request.test.mjs` — 9 tests

**Mətn və docs**:
- `docs/IMPLEMENTATION_STATUS.md` — Updated verification results

### qalancak blokklər
- Audit logging durability — DB-verified, end-user pg client not launched buraxıcısı.
- Browser automation — Oxşar layihədə click/screenshots yox olub.
- Ticket sales, OMR, reporting — Milestone 5-9 yoxlanmadı (durdursuz).
- Development database `hilal` artıq 7 migrationla actual (additive, heç silinməmedi).

### cavan
Heç bir `any`, `@ts-ignore`, yoki azalan authorization implemented edilməyib. Bütün dəyişmələr additive migration vasitəsilə, veriqən məlumatların silinməsi čiçin yoq. PostgreSQL `hilal_test` izoltik databaseinə yoxlanıldı və bütöv test siyahısı (51 unit + 46 integration) green cavabla abideydi. Next.js production build istiqra bərpa etdi. Milestone 4 certifika edilmişdir.