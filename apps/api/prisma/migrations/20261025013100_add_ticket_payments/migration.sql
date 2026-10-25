-- Add payment fields to tickets table for payment recording
ALTER TABLE "tickets" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "tickets" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "tickets" ADD COLUMN "paymentDate" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "notes" TEXT;

CREATE INDEX "tickets_paymentStatus_idx" ON "tickets"("paymentStatus");