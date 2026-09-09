-- Migration 1.3: Add performed_by_organisation_id and remove organisation_id from tests table
-- Track which organisation performed each test (may differ from batch owner)
-- Remove redundant organisation_id column (batch ownership is stored on batch table)

-- 1. Add the performed_by_organisation_id column
ALTER TABLE "public"."tests"
ADD COLUMN "performed_by_organisation_id" "uuid" REFERENCES "public"."organisation"("id") ON DELETE SET NULL;

-- 2. Populate existing tests with the batch's current custodian organisation
-- Historically tests were performed by batch owners, so we use current custody
UPDATE "public"."tests"
SET "performed_by_organisation_id" = (
  SELECT cbc.organisation_id
  FROM current_batch_custody cbc
  WHERE cbc.batch_id = tests.batch_id
  LIMIT 1
)
WHERE "performed_by_organisation_id" IS NULL;

-- 3. Create index for queries filtering by performing org
CREATE INDEX "idx_tests_performed_by_organisation" ON "public"."tests" USING btree ("performed_by_organisation_id");

-- 4. Add comment for documentation
COMMENT ON COLUMN "public"."tests"."performed_by_organisation_id" IS 'Organisation that performed this test (may be different from batch owner if tested by Testing organisation)';

-- 5. Remove the redundant organisation_id column and its index
-- Batch ownership is tracked via the batch table and current_batch_custody
DROP INDEX IF EXISTS "idx_tests_organisation_id";
ALTER TABLE "public"."tests" DROP COLUMN IF EXISTS "organisation_id";
