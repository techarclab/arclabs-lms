-- Question folders: keep each imported paper (or any set of questions) separate in the bank.
ALTER TABLE "questions" ADD COLUMN "folder" TEXT;
CREATE INDEX "questions_organizationId_folder_idx" ON "questions"("organizationId", "folder");

-- Existing imports: questions saved together by one import share the same createdAt.
-- Put each such batch (3 or more) in its own folder, named after when it was imported (India time),
-- so old papers stop mixing. Faculty can rename these folders afterwards.
UPDATE "questions" q
SET "folder" = 'Imported ' || to_char(q."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
FROM (
  SELECT "organizationId", "createdAt"
  FROM "questions"
  WHERE "folder" IS NULL
  GROUP BY "organizationId", "createdAt"
  HAVING COUNT(*) >= 3
) b
WHERE q."organizationId" = b."organizationId" AND q."createdAt" = b."createdAt" AND q."folder" IS NULL;
