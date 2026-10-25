-- Move monetary values from whole AZN to integer qəpik (1 AZN = 100 qəpik).
--
-- Exam prices:
--   positive AZN value -> same value in qəpik
--   0                  -> NULL (not configured); the old schema used 0 as an
--                         implicit default, so treating it as free would
--                         silently make existing exams free.
--
-- Ticket prices are recorded sale amounts. Positive values are converted and
-- 0 remains 0 because it is an actual recorded amount, not a default.
--
-- This migration is one-time. Prisma records applied migrations; do not run
-- this file manually against an already-migrated database.

ALTER TABLE "exams" ALTER COLUMN "price" DROP DEFAULT;
ALTER TABLE "exams" ALTER COLUMN "price" DROP NOT NULL;

UPDATE "exams" SET "price" = NULL WHERE "price" = 0;
UPDATE "exams" SET "price" = "price" * 100 WHERE "price" IS NOT NULL;
UPDATE "tickets" SET "price" = "price" * 100 WHERE "price" > 0;

COMMENT ON COLUMN "exams"."price" IS
  'Ticket price in integer qəpik; NULL = not configured, 0 = explicitly free';
COMMENT ON COLUMN "tickets"."price" IS
  'Recorded sale price in integer qəpik';
