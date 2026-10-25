# Price unit and migration runbook

## Rule

- Internal money unit: **integer qəpik**.
- Conversion: **1 AZN = 100 qəpik**.
- `Exam.price`: nullable integer. `null` means exam sale price is not configured; `0` means explicitly free.
- `Ticket.price`: integer. `0` means a free ticket recorded by an authorized seller; positive values are qəpik.
- UI display converts qəpik to AZN via `formatAzn`.

## Migration

Migration: `20261025223000_price_unit_qepik`.

- Positive old exam prices are converted by multiplying by `100`.
- Old exam prices equal to `0` are converted to `NULL`, not to a free exam.
- Positive old ticket prices are converted by multiplying by `100`.
- Positive exam price means old value was AZN; no conversion of `null` occurred because old schema did not allow it.

## Purchase rules

- Ticket sale is rejected when exam price is missing, invalid, or negative.
- Free exam: explicit `0` qəpik; ticket price `0`.
- Client-submitted price is compatibility-only; server compares it with authoritative exam price and rejects mismatch.
- Online payment is not implemented; `PENDING` tickets remain `PENDING` until an explicit payment update.

## Safety

- No migration was applied to any shared or production database during this work.
- Local databases had no exam/ticket data before this session.
- Test database still contains one legacy test exam at old unit `35`.
- Preflight, backup, deploy, rollback are required before applying.

## Backup

```bash
docker compose exec -T postgres pg_dump -U hilal -d hilal -Fc > /tmp/opencode/backups/hilal-before-price-migration.dump
docker compose exec -T postgres pg_dump -U hilal -d hilal_test -Fc > /tmp/opencode/backups/hilal_test-before-price-migration.dump
```

## Apply

```bash
DATABASE_URL=postgresql://hilal:hilal@localhost:5432/hilal pnpm --filter @hilal/api exec prisma migrate deploy
DATABASE_URL=postgresql://hilal:hilal@localhost:5432/hilal_test pnpm --filter @hilal/api exec prisma migrate deploy
```

## Rollback

- Restore pre-migration backup before running inverse SQL against shared data.
- Inverse migration must not be applied blindly; restore backup is safer for recorded ticket amounts.

## Verify

- Migration test: `apps/api/test/price-migration.e2e-spec.ts`.
- Unit tests: API money and exam price tests.
- E2E: ticket purchase, migration, QR verification, price checks.
