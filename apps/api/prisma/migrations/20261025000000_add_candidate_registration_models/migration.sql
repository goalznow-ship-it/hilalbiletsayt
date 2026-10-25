-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "candidate_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidates_candidate_number_key" ON "candidates"("candidate_number");

-- CreateTable
CREATE TABLE "examination_registrations" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" UUID,

    CONSTRAINT "examination_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "examination_registrations_candidate_id_idx" ON "examination_registrations"("candidate_id");

-- CreateIndex
CREATE INDEX "examination_registrations_exam_id_idx" ON "examination_registrations"("exam_id");

-- CreateIndex
CREATE INDEX "examination_registrations_session_id_idx" ON "examination_registrations"("session_id");

-- CreateIndex
CREATE INDEX "examination_registrations_branch_id_idx" ON "examination_registrations"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_registrations_candidate_session_key" ON "examination_registrations"("candidate_id", "session_id");

-- AddForeignKey
ALTER TABLE "examination_registrations" ADD CONSTRAINT "examination_registrations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- AddForeignKey
ALTER TABLE "examination_registrations" ADD CONSTRAINT "examination_registrations_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- AddForeignKey
ALTER TABLE "examination_registrations" ADD CONSTRAINT "examination_registrations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- AddForeignKey
ALTER TABLE "examination_registrations" ADD CONSTRAINT "examination_registrations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON UPDATE CASCADE ON DELETE SET NULL;
