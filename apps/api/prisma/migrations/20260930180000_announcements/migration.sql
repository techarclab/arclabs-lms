-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "collegeEmailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "organization_users" ADD COLUMN     "collegeEmail" TEXT;

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'GENERAL',
    "examId" UUID,
    "audience" JSONB NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "emailed" INTEGER NOT NULL DEFAULT 0,
    "collegeEmails" INTEGER NOT NULL DEFAULT 0,
    "personalEmails" INTEGER NOT NULL DEFAULT 0,
    "emailStatus" TEXT NOT NULL DEFAULT 'sent',
    "sentById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_recipients" (
    "announcementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "email" TEXT,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "announcement_recipients_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE INDEX "announcements_organizationId_createdAt_idx" ON "announcements"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "announcement_recipients_userId_idx" ON "announcement_recipients"("userId");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
