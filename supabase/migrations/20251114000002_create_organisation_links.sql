-- Migration 1.2a: Create organisation links table
-- Tracks accepted relationships between General and Testing organisations

CREATE TABLE "public"."organisation_link" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "general_org_id" "uuid" NOT NULL,
    "testing_org_id" "uuid" NOT NULL,
    "can_process" boolean DEFAULT false NOT NULL,
    "can_test" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organisation_link_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organisation_link_unique" UNIQUE ("general_org_id", "testing_org_id"),
    CONSTRAINT "organisation_link_general_org_fkey" FOREIGN KEY ("general_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "organisation_link_testing_org_fkey" FOREIGN KEY ("testing_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "organisation_link_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
);

-- Add indexes for common queries
CREATE INDEX "idx_organisation_link_general_org" ON "public"."organisation_link" USING btree ("general_org_id");
CREATE INDEX "idx_organisation_link_testing_org" ON "public"."organisation_link" USING btree ("testing_org_id");

-- Add comments for documentation
COMMENT ON TABLE "public"."organisation_link" IS 'Accepted links between General and Testing organisations with permissions';
COMMENT ON COLUMN "public"."organisation_link"."can_process" IS 'Testing org can receive batches for processing';
COMMENT ON COLUMN "public"."organisation_link"."can_test" IS 'Testing org can receive batches for testing';

-- Set table owner
ALTER TABLE "public"."organisation_link" OWNER TO "postgres";
