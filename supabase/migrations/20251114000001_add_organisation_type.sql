-- Migration 1.1: Add organisation type
-- Add type enum and column to support General and Testing organisations

-- 1. Create the organisation type enum
CREATE TYPE "public"."organisation_type" AS ENUM ('General', 'Testing');

-- 2. Add type column to organisation table
ALTER TABLE "public"."organisation"
ADD COLUMN "type" "public"."organisation_type" DEFAULT 'General' NOT NULL;

-- 3. Create index on type for filtering performance
CREATE INDEX "idx_organisation_type" ON "public"."organisation" USING btree ("type");

-- 4. Add comment for documentation
COMMENT ON COLUMN "public"."organisation"."type" IS 'Organisation type: General (seed producers) or Testing (testing/processing services)';
