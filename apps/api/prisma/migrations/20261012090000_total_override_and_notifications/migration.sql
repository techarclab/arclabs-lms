-- Faculty can set a student's final total by hand (proxy / malpractice cases).
ALTER TABLE "quiz_attempts"
  ADD COLUMN "totalOverride" DECIMAL(7,2),
  ADD COLUMN "calculatedScore" DECIMAL(7,2),
  ADD COLUMN "overrideReason" TEXT,
  ADD COLUMN "overrideById" UUID,
  ADD COLUMN "overrideAt" TIMESTAMP(3);

-- When the notification bell was last opened (newer items show as unread).
ALTER TABLE "users" ADD COLUMN "notificationsSeenAt" TIMESTAMP(3);
