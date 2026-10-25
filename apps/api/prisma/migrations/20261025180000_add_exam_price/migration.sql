-- Add server-authoritative ticket price to exams.
ALTER TABLE "exams" ADD COLUMN "price" INTEGER NOT NULL DEFAULT 0;
