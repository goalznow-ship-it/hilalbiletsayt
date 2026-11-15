CREATE TABLE "omr_templates" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "answerKeyId" UUID NOT NULL,
  "layout" JSONB NOT NULL,
  "sample" BYTEA NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "omr_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "omr_templates_answerKeyId_fkey" FOREIGN KEY ("answerKeyId") REFERENCES "omr_answer_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "omr_templates_answerKeyId_idx" ON "omr_templates"("answerKeyId");
ALTER TABLE "omr_uploads" ADD COLUMN "templateId" UUID;
ALTER TABLE "omr_uploads" ADD CONSTRAINT "omr_uploads_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "omr_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
