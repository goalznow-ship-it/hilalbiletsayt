ALTER TABLE "tickets" ADD COLUMN "purchaseKey" UUID, ADD COLUMN "purchaseHash" TEXT, ADD COLUMN "receiptToken" TEXT;
CREATE UNIQUE INDEX "tickets_purchaseKey_key" ON "tickets"("purchaseKey");
CREATE UNIQUE INDEX "tickets_receiptToken_key" ON "tickets"("receiptToken");
