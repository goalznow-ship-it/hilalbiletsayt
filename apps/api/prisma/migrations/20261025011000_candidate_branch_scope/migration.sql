-- Add an optional owning branch to candidates.
-- Existing candidates remain valid; branch visibility also considers registrations.
ALTER TABLE "candidates" ADD COLUMN "branch_id" UUID;

CREATE INDEX "candidates_branch_id_idx" ON "candidates"("branch_id");

ALTER TABLE "candidates"
ADD CONSTRAINT "candidates_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
