-- Preserve the existing Question model with an additive migration.
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "variants" TEXT NOT NULL,
    "correct" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "questions_examId_idx" ON "questions"("examId");

ALTER TABLE "questions" ADD CONSTRAINT "questions_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
