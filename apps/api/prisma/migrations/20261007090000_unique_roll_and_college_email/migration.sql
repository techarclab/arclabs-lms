-- One student, one account: inside a college, a roll number and a college email can belong to
-- only one person. (Sign-in emails are already unique across the whole LMS.)

-- Store them the way the app compares them: roll numbers in capitals without spaces,
-- emails in small letters.
UPDATE "organization_users"
SET "externalId" = NULLIF(upper(regexp_replace("externalId", '\s', '', 'g')), '')
WHERE "externalId" IS NOT NULL
  AND "externalId" IS DISTINCT FROM NULLIF(upper(regexp_replace("externalId", '\s', '', 'g')), '');
UPDATE "organization_users"
SET "collegeEmail" = NULLIF(lower(btrim("collegeEmail")), '')
WHERE "collegeEmail" IS NOT NULL
  AND "collegeEmail" IS DISTINCT FROM NULLIF(lower(btrim("collegeEmail")), '');

-- The database itself refuses a second registration. Colleges that still have students registered
-- twice get these rules as soon as an admin merges them (People → Review & merge); until then the
-- app already blocks new duplicates, and this migration must not fail on old data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "organization_users" WHERE "externalId" IS NOT NULL
    GROUP BY "organizationId", "externalId" HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "organization_users_org_roll_key"
      ON "organization_users" ("organizationId", "externalId") WHERE "externalId" IS NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "organization_users" WHERE "collegeEmail" IS NOT NULL
    GROUP BY "organizationId", "collegeEmail" HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "organization_users_org_college_email_key"
      ON "organization_users" ("organizationId", "collegeEmail") WHERE "collegeEmail" IS NOT NULL;
  END IF;
END $$;
