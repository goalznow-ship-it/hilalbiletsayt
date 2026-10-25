-- Case-insensitive uniqueness for non-null candidate emails.
-- Nullable emails remain allowed. The service normalizes emails to lower case.
CREATE UNIQUE INDEX "candidates_email_lower_key"
ON "candidates" (LOWER("email"))
WHERE "email" IS NOT NULL;
