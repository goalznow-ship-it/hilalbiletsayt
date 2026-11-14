-- Allocate once, including existing tickets. Cancellation never reuses a number.
CREATE SEQUENCE "ticket_work_number_seq" START WITH 10000000 MINVALUE 10000000 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE "tickets" ADD COLUMN "work_number" TEXT NOT NULL DEFAULT nextval('ticket_work_number_seq'::regclass)::text;
ALTER SEQUENCE "ticket_work_number_seq" OWNED BY "tickets"."work_number";
CREATE UNIQUE INDEX "tickets_work_number_key" ON "tickets"("work_number");
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_work_number_format" CHECK ("work_number" ~ '^[0-9]{8}$');
