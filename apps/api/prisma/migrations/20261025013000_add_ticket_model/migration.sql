-- Ticket sales model. Tickets are issued per exam session and linked to candidates/branches/sellers.
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "exam_id" UUID NOT NULL,
    "session_id" UUID,
    "candidate_id" UUID,
    "branch_id" UUID,
    "seller_id" UUID,
    "price" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "type" TEXT NOT NULL DEFAULT 'STANDARD',
    "qr_code" TEXT,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),
    "used_by" UUID,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tickets_exam_id_idx" ON "tickets"("exam_id");
CREATE INDEX "tickets_session_id_idx" ON "tickets"("session_id");
CREATE INDEX "tickets_candidate_id_idx" ON "tickets"("candidate_id");
CREATE INDEX "tickets_branch_id_idx" ON "tickets"("branch_id");
CREATE INDEX "tickets_seller_id_idx" ON "tickets"("seller_id");
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- Add foreign key relations
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON UPDATE SET NULL ON DELETE SET NULL;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON UPDATE SET NULL ON DELETE SET NULL;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON UPDATE SET NULL ON DELETE SET NULL;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON UPDATE SET NULL ON DELETE SET NULL;