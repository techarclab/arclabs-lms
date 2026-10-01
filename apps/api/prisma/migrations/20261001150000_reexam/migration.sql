-- Re-exam: an attempt can be set aside (kept as a record) so the student gets a fresh attempt.
ALTER TABLE "quiz_attempts" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "quiz_attempts" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "quiz_attempts" ADD COLUMN "voidedById" UUID;
ALTER TABLE "quiz_attempts" ADD COLUMN "reexamUntil" TIMESTAMP(3);
