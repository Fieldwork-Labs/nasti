-- Migration 1.2a: Create organisation links table
-- Tracks accepted relationships between requesting organisations and providers

CREATE TABLE "public"."organisation_link" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requesting_org_id" "uuid" NOT NULL,
    "provider_org_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organisation_link_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organisation_link_unique" UNIQUE ("requesting_org_id", "provider_org_id"),
    CONSTRAINT "organisation_link_distinct_orgs" CHECK ("requesting_org_id" <> "provider_org_id"),
    CONSTRAINT "organisation_link_requester_fkey" FOREIGN KEY ("requesting_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "organisation_link_provider_fkey" FOREIGN KEY ("provider_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "organisation_link_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")
);

-- Add indexes for common queries
CREATE INDEX "idx_organisation_link_requesting_org" ON "public"."organisation_link" USING btree ("requesting_org_id");
CREATE INDEX "idx_organisation_link_provider_org" ON "public"."organisation_link" USING btree ("provider_org_id");

-- Add comments for documentation
COMMENT ON TABLE "public"."organisation_link" IS 'Accepted testing-service links between requesting organisations and providers';

-- Set table owner
ALTER TABLE "public"."organisation_link" OWNER TO "postgres";
