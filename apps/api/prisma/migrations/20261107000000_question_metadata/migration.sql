-- Optional metadata preserves every existing question and answer-key snapshot.
ALTER TABLE "questions" ADD COLUMN "subject" TEXT,
                        ADD COLUMN "topic" TEXT,
                        ADD COLUMN "imageUrl" TEXT;
CREATE INDEX "questions_subject_topic_idx" ON "questions"("subject", "topic");
