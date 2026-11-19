-- Students move freely between sections unless the exam turns "Sections one at a time" on.
ALTER TABLE "quizzes" ALTER COLUMN "sectionsInOrder" SET DEFAULT false;
UPDATE "quizzes" SET "sectionsInOrder" = false;
