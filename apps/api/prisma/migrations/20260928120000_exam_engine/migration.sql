-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ResultVisibility" AS ENUM ('SCORE_NOW_ANSWERS_AFTER_CLOSE', 'IMMEDIATE', 'MANUAL_RELEASE');

-- CreateEnum
CREATE TYPE "SubmitReason" AS ENUM ('MANUAL', 'TIME_UP', 'VIOLATIONS', 'WINDOW_CLOSED', 'INSTRUCTOR');

-- CreateEnum
CREATE TYPE "ProctorEventType" AS ENUM ('FULLSCREEN_EXIT', 'TAB_HIDDEN', 'WINDOW_BLUR', 'COPY', 'PASTE', 'CONTEXT_MENU', 'DEVTOOLS', 'SESSION_TAKEOVER', 'RESUMED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'NUMERIC';
ALTER TYPE "QuestionType" ADD VALUE 'CODING';

-- DropIndex
DROP INDEX "quizzes_organizationId_idx";

-- DropIndex
DROP INDEX "questions_organizationId_idx";

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "assignToAll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockCopyPaste" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "maxViolations" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "negativeMarking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "requireFullscreen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "resultVisibility" "ResultVisibility" NOT NULL DEFAULT 'SCORE_NOW_ANSWERS_AFTER_CLOSE',
ADD COLUMN     "resultsReleasedAt" TIMESTAMP(3),
ADD COLUMN     "shuffleOptions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "startsAt" TIMESTAMP(3),
ALTER COLUMN "passPct" SET DEFAULT 40,
ALTER COLUMN "maxAttempts" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "coding" JSONB,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "negativeMarks" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "quiz_attempts" ADD COLUMN     "correctCount" INTEGER,
ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "percentage" DECIMAL(5,2),
ADD COLUMN     "questionOrder" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "results" JSONB,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "submitReason" "SubmitReason",
ADD COLUMN     "timeTakenSec" INTEGER,
ADD COLUMN     "unansweredCount" INTEGER,
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "violationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wrongCount" INTEGER;

-- CreateTable
CREATE TABLE "exam_audiences" (
    "id" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "departmentId" UUID,
    "userId" UUID,

    CONSTRAINT "exam_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctor_events" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "type" "ProctorEventType" NOT NULL,
    "counted" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "proctor_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_audiences_quizId_departmentId_key" ON "exam_audiences"("quizId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_audiences_quizId_userId_key" ON "exam_audiences"("quizId", "userId");

-- CreateIndex
CREATE INDEX "proctor_events_attemptId_occurredAt_idx" ON "proctor_events"("attemptId", "occurredAt");

-- CreateIndex
CREATE INDEX "quizzes_organizationId_status_idx" ON "quizzes"("organizationId", "status");

-- CreateIndex
CREATE INDEX "questions_organizationId_archived_idx" ON "questions"("organizationId", "archived");

-- CreateIndex
CREATE INDEX "questions_organizationId_topic_idx" ON "questions"("organizationId", "topic");

-- CreateIndex
CREATE INDEX "quiz_attempts_quizId_status_idx" ON "quiz_attempts"("quizId", "status");

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_audiences" ADD CONSTRAINT "exam_audiences_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_audiences" ADD CONSTRAINT "exam_audiences_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_audiences" ADD CONSTRAINT "exam_audiences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proctor_events" ADD CONSTRAINT "proctor_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
