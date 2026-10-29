CREATE TABLE "omr_answer_keys" (
  "id" UUID PRIMARY KEY, "examId" UUID NOT NULL REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "variant" TEXT NOT NULL, "version" INTEGER NOT NULL, "choiceCount" INTEGER NOT NULL,
  "answers" JSONB NOT NULL, "scoring" JSONB NOT NULL, "digest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "omr_answer_keys_examId_variant_version_key" ON "omr_answer_keys"("examId", "variant", "version");
CREATE TABLE "omr_sheets" (
  "id" UUID PRIMARY KEY, "token" TEXT NOT NULL,
  "ticketId" UUID NOT NULL REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "answerKeyId" UUID NOT NULL REFERENCES "omr_answer_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "candidateId" UUID NOT NULL, "examId" UUID NOT NULL, "branchId" UUID NOT NULL,
  "templateVersion" TEXT NOT NULL DEFAULT 'hilal-a4-v1', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "omr_sheets_token_key" ON "omr_sheets"("token");
CREATE UNIQUE INDEX "omr_sheets_ticketId_key" ON "omr_sheets"("ticketId");
CREATE TABLE "omr_uploads" (
  "id" UUID PRIMARY KEY, "examId" UUID NOT NULL REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdBy" UUID NOT NULL, "sha256" TEXT NOT NULL, "size" INTEGER NOT NULL, "mime" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attemptId" UUID, "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "omr_uploads_examId_createdBy_sha256_key" ON "omr_uploads"("examId", "createdBy", "sha256");
CREATE INDEX "omr_uploads_createdBy_createdAt_idx" ON "omr_uploads"("createdBy", "createdAt");
CREATE TABLE "omr_pages" (
  "id" UUID PRIMARY KEY, "uploadId" UUID NOT NULL REFERENCES "omr_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "pageIndex" INTEGER NOT NULL, "sheetId" UUID REFERENCES "omr_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL, "data" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "omr_pages_sheetId_key" ON "omr_pages"("sheetId");
CREATE UNIQUE INDEX "omr_pages_uploadId_pageIndex_key" ON "omr_pages"("uploadId", "pageIndex");
