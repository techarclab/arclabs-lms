-- AlterEnum
ALTER TYPE "ProctorEventType" ADD VALUE 'CAMERA_OFF';
ALTER TYPE "ProctorEventType" ADD VALUE 'SHORTCUT';

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "requireCamera" BOOLEAN NOT NULL DEFAULT true;
