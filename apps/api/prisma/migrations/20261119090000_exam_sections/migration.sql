-- Exams can be divided into sections (e.g. Aptitude, Technical).
ALTER TABLE "quiz_questions" ADD COLUMN "section" TEXT;
