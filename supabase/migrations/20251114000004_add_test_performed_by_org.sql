-- Migration 1.3: Add performed_by_organisation_id to tests table
-- Track which organisation performed each test (may differ from batch owner)

-- 1. Add the performed_by_organisation_id column
ALTER TABLE "public"."tests"
ADD COLUMN "performed_by_organisation_id" "uuid" REFERENCES "public"."organisation"("id") ON DELETE SET NULL;

-- 2. Populate existing tests with the batch's current custodian organisation
-- For now, we'll use the organisation_id from the tests table (batch owner)
-- This is reasonable since historically tests were performed by batch owners
UPDATE "public"."tests"
SET "performed_by_organisation_id" = "organisation_id"
WHERE "performed_by_organisation_id" IS NULL;

-- 3. Create index for queries filtering by performing org
CREATE INDEX "idx_tests_performed_by_organisation" ON "public"."tests" USING btree ("performed_by_organisation_id");

-- 4. Add comment for documentation
COMMENT ON COLUMN "public"."tests"."performed_by_organisation_id" IS 'Organisation that performed this test (may be different from batch owner if tested by Testing organisation)';
