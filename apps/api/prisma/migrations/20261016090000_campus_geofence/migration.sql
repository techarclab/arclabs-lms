-- Geofence: exams that must be written on campus.
ALTER TYPE "ProctorEventType" ADD VALUE 'OUTSIDE_CAMPUS';
ALTER TYPE "ProctorEventType" ADD VALUE 'LOCATION_OFF';

ALTER TABLE "organizations"
  ADD COLUMN "campusAddress" TEXT,
  ADD COLUMN "campusLat" DOUBLE PRECISION,
  ADD COLUMN "campusLng" DOUBLE PRECISION,
  ADD COLUMN "campusRadiusM" INTEGER NOT NULL DEFAULT 300;

ALTER TABLE "quizzes" ADD COLUMN "requireOnCampus" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "quiz_attempts"
  ADD COLUMN "startLat" DOUBLE PRECISION,
  ADD COLUMN "startLng" DOUBLE PRECISION,
  ADD COLUMN "startAccuracyM" DOUBLE PRECISION,
  ADD COLUMN "startDistanceM" DOUBLE PRECISION;
