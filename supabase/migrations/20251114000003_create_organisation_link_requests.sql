-- Migration 1.2b: Create organisation link requests table
-- Tracks pending link requests awaiting Testing organisation approval

CREATE TABLE "public"."organisation_link_request" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "general_org_id" "uuid" NOT NULL,
    "testing_org_id" "uuid" NOT NULL,
    "can_process" boolean DEFAULT false NOT NULL,
    "can_test" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    CONSTRAINT "organisation_link_request_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organisation_link_request_general_org_fkey" FOREIGN KEY ("general_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "organisation_link_request_testing_org_fkey" FOREIGN KEY ("testing_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "organisation_link_request_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id"),
    CONSTRAINT "organisation_link_request_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id")
);

-- Add indexes for common queries
CREATE INDEX "idx_organisation_link_request_general_org" ON "public"."organisation_link_request" USING btree ("general_org_id");
CREATE INDEX "idx_organisation_link_request_testing_org" ON "public"."organisation_link_request" USING btree ("testing_org_id");
CREATE INDEX "idx_organisation_link_request_accepted_at" ON "public"."organisation_link_request" USING btree ("accepted_at");

-- Add comments for documentation
COMMENT ON TABLE "public"."organisation_link_request" IS 'Pending link requests between General and Testing organisations';
COMMENT ON COLUMN "public"."organisation_link_request"."can_process" IS 'Requested permission for testing org to receive batches for processing';
COMMENT ON COLUMN "public"."organisation_link_request"."can_test" IS 'Requested permission for testing org to receive batches for testing';

-- Set table owner
ALTER TABLE "public"."organisation_link_request" OWNER TO "postgres";
