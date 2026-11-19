-- Sections one at a time: finish a section to open the next one.
ALTER TABLE "quizzes" ADD COLUMN "sectionsInOrder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "quiz_attempts" ADD COLUMN "sectionIndex" INTEGER NOT NULL DEFAULT 0;
