-- Definition-of-Done hardening: role catalogue, sale invariants enforced by the
-- database, business-day closure (freeze) and result publication.

-- 1. Role catalogue. Roles are referenced by name in code, so seed them here
--    instead of relying on manual inserts.
INSERT INTO "roles" ("id", "name", "description", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'SUPER_ADMIN', 'Super administrator', NOW(), NOW()),
  (gen_random_uuid(), 'CENTRAL_ADMIN', 'Mərkəzi administrator', NOW(), NOW()),
  (gen_random_uuid(), 'BRANCH_MANAGER', 'Filial rəhbəri', NOW(), NOW()),
  (gen_random_uuid(), 'SELLER', 'Satıcı', NOW(), NOW()),
  (gen_random_uuid(), 'OMR_OPERATOR', 'OMR / nəticə operatoru', NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

-- 2. One live ticket per candidate and session, even under concurrent sales.
CREATE UNIQUE INDEX "tickets_candidate_session_live_key"
  ON "tickets" ("candidate_id", "session_id")
  WHERE "status" IN ('ACTIVE', 'USED')
    AND "candidate_id" IS NOT NULL
    AND "session_id" IS NOT NULL;

-- 3. Session capacity is checked under a row lock on the session for every
--    insert/reactivation, regardless of which code path writes the ticket.
CREATE OR REPLACE FUNCTION hilal_enforce_ticket_capacity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  session_capacity integer;
  live_tickets integer;
BEGIN
  IF NEW."session_id" IS NULL OR NEW."status" NOT IN ('ACTIVE', 'USED') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD."session_id" IS NOT DISTINCT FROM NEW."session_id"
     AND OLD."status" IN ('ACTIVE', 'USED') THEN
    RETURN NEW;
  END IF;

  SELECT "capacity" INTO session_capacity
    FROM "exam_sessions" WHERE "id" = NEW."session_id" FOR UPDATE;
  SELECT count(*) INTO live_tickets
    FROM "tickets"
   WHERE "session_id" = NEW."session_id"
     AND "status" IN ('ACTIVE', 'USED')
     AND "id" <> NEW."id";

  IF live_tickets >= session_capacity THEN
    RAISE EXCEPTION 'HILAL_SESSION_CAPACITY_EXCEEDED';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "tickets_capacity_guard"
  BEFORE INSERT OR UPDATE OF "status", "session_id" ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION hilal_enforce_ticket_capacity();

-- 4. Business day closure. Business dates use Azerbaijan local time (UTC+4,
--    no DST). Timestamps are stored as UTC "timestamp without time zone".
CREATE OR REPLACE FUNCTION hilal_business_date(ts timestamp) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT ((ts AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Baku')::date
$$;

CREATE OR REPLACE FUNCTION hilal_business_day_lock_key(branch uuid, day date) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$
  SELECT hashtextextended('hilal-day:' || branch::text || ':' || day::text, 0)
$$;

CREATE TABLE "business_day_closures" (
  "id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "closed_by" UUID NOT NULL,
  "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ticket_count" INTEGER NOT NULL,
  "paid_count" INTEGER NOT NULL,
  "cancelled_count" INTEGER NOT NULL,
  "paid_amount" INTEGER NOT NULL,
  "summary" JSONB NOT NULL,
  CONSTRAINT "business_day_closures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "business_day_closures_branch_date_key"
  ON "business_day_closures" ("branch_id", "business_date");
CREATE INDEX "business_day_closures_business_date_idx"
  ON "business_day_closures" ("business_date");
ALTER TABLE "business_day_closures"
  ADD CONSTRAINT "business_day_closures_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_day_closures"
  ADD CONSTRAINT "business_day_closures_closed_by_fkey"
  FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Closures are append-only. Test suites may opt in to deleting them with
-- `SET LOCAL hilal.allow_closure_delete = 'on'`; the application never does.
CREATE OR REPLACE FUNCTION hilal_closure_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hilal.allow_closure_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'HILAL_BUSINESS_DAY_CLOSED';
END $$;

CREATE TRIGGER "business_day_closures_immutable"
  BEFORE UPDATE OR DELETE ON "business_day_closures"
  FOR EACH ROW EXECUTE FUNCTION hilal_closure_immutable();

-- Tickets that belong to a closed (branch, business date) are frozen. The only
-- permitted change is admitting the holder (ACTIVE -> USED) on exam day.
-- A shared advisory lock serialises sales against a concurrent closure, which
-- takes the same key exclusively.
CREATE OR REPLACE FUNCTION hilal_is_day_closed(branch uuid, ts timestamp) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  day date;
BEGIN
  IF branch IS NULL THEN
    RETURN false;
  END IF;
  day := hilal_business_date(ts);
  PERFORM pg_advisory_xact_lock_shared(hilal_business_day_lock_key(branch, day));
  RETURN EXISTS (
    SELECT 1 FROM "business_day_closures"
     WHERE "branch_id" = branch AND "business_date" = day
  );
END $$;

CREATE OR REPLACE FUNCTION hilal_enforce_day_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF hilal_is_day_closed(NEW."branch_id", NEW."registered_at") THEN
      RAISE EXCEPTION 'HILAL_BUSINESS_DAY_CLOSED';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF hilal_is_day_closed(OLD."branch_id", OLD."registered_at") THEN
      RAISE EXCEPTION 'HILAL_BUSINESS_DAY_CLOSED';
    END IF;
    RETURN OLD;
  END IF;

  IF hilal_is_day_closed(OLD."branch_id", OLD."registered_at") THEN
    IF NEW."exam_id" IS DISTINCT FROM OLD."exam_id"
       OR NEW."session_id" IS DISTINCT FROM OLD."session_id"
       OR NEW."candidate_id" IS DISTINCT FROM OLD."candidate_id"
       OR NEW."branch_id" IS DISTINCT FROM OLD."branch_id"
       OR NEW."seller_id" IS DISTINCT FROM OLD."seller_id"
       OR NEW."price" IS DISTINCT FROM OLD."price"
       OR NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."qr_code" IS DISTINCT FROM OLD."qr_code"
       OR NEW."registered_at" IS DISTINCT FROM OLD."registered_at"
       OR NEW."paymentStatus" IS DISTINCT FROM OLD."paymentStatus"
       OR NEW."paymentMethod" IS DISTINCT FROM OLD."paymentMethod"
       OR NEW."paymentDate" IS DISTINCT FROM OLD."paymentDate"
       OR (NEW."status" IS DISTINCT FROM OLD."status"
           AND NOT (OLD."status" = 'ACTIVE' AND NEW."status" = 'USED')) THEN
      RAISE EXCEPTION 'HILAL_BUSINESS_DAY_CLOSED';
    END IF;
  END IF;
  -- A ticket may not be moved into a closed day either.
  IF NEW."branch_id" IS DISTINCT FROM OLD."branch_id"
     OR NEW."registered_at" IS DISTINCT FROM OLD."registered_at" THEN
    IF hilal_is_day_closed(NEW."branch_id", NEW."registered_at") THEN
      RAISE EXCEPTION 'HILAL_BUSINESS_DAY_CLOSED';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "tickets_day_freeze_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION hilal_enforce_day_freeze();

-- 5. Result publication. Results stay private until an administrator publishes
--    them for the exam.
ALTER TABLE "exams" ADD COLUMN "results_published_at" TIMESTAMP(3);
ALTER TABLE "exams" ADD COLUMN "results_published_by" UUID;

-- 6. Close pre-existing drift between schema.prisma and the database. Ticket
--    codes and QR tokens must be unique: they identify a ticket at the door.
ALTER TABLE "tickets" ALTER COLUMN "price" DROP DEFAULT;
ALTER TABLE "tickets" ALTER COLUMN "qr_code" SET NOT NULL;
CREATE UNIQUE INDEX "tickets_code_key" ON "tickets"("code");
CREATE UNIQUE INDEX "tickets_qr_code_key" ON "tickets"("qr_code");

ALTER TABLE "tickets" DROP CONSTRAINT "tickets_session_id_fkey";
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_candidate_id_fkey";
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_branch_id_fkey";
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_seller_id_fkey";
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
