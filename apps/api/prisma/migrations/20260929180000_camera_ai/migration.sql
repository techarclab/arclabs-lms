-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProctorEventType" ADD VALUE 'FACE_MISSING';
ALTER TYPE "ProctorEventType" ADD VALUE 'MULTIPLE_FACES';
ALTER TYPE "ProctorEventType" ADD VALUE 'LOOKING_AWAY';
ALTER TYPE "ProctorEventType" ADD VALUE 'PHONE_DETECTED';

-- CreateTable
CREATE TABLE "proctor_snapshots" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "eventType" "ProctorEventType" NOT NULL,
    "image" BYTEA NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proctor_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proctor_snapshots_attemptId_idx" ON "proctor_snapshots"("attemptId");

-- AddForeignKey
ALTER TABLE "proctor_snapshots" ADD CONSTRAINT "proctor_snapshots_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
