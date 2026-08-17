-- Migration 1.2b: Create organisation link requests table
-- Tracks pending link requests awaiting provider approval

CREATE TABLE "public"."organisation_link_request" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requesting_org_id" "uuid" NOT NULL,
    "provider_org_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    CONSTRAINT "organisation_link_request_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organisation_link_request_distinct_orgs" CHECK ("requesting_org_id" <> "provider_org_id"),
    CONSTRAINT "organisation_link_request_requester_fkey" FOREIGN KEY ("requesting_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "organisation_link_request_provider_fkey" FOREIGN KEY ("provider_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "organisation_link_request_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id"),
    CONSTRAINT "organisation_link_request_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id")
);

-- Add indexes for common queries
CREATE INDEX "idx_organisation_link_request_requester" ON "public"."organisation_link_request" USING btree ("requesting_org_id");
CREATE INDEX "idx_organisation_link_request_provider" ON "public"."organisation_link_request" USING btree ("provider_org_id");
CREATE INDEX "idx_organisation_link_request_accepted_at" ON "public"."organisation_link_request" USING btree ("accepted_at");

-- Add comments for documentation
COMMENT ON TABLE "public"."organisation_link_request" IS 'Pending testing-service link requests between requesting organisations and providers';

-- Set table owner
ALTER TABLE "public"."organisation_link_request" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.validate_testing_provider_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation o
    WHERE o.id = NEW.provider_org_id
      AND o.is_testing_provider
  ) THEN
    RAISE EXCEPTION 'Provider organisation must offer testing services'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organisation_link_validate_provider
  BEFORE INSERT OR UPDATE OF provider_org_id
  ON public.organisation_link
  FOR EACH ROW EXECUTE FUNCTION public.validate_testing_provider_link();

CREATE TRIGGER organisation_link_request_validate_provider
  BEFORE INSERT OR UPDATE OF provider_org_id
  ON public.organisation_link_request
  FOR EACH ROW EXECUTE FUNCTION public.validate_testing_provider_link();

COMMENT ON FUNCTION public.validate_testing_provider_link() IS
  'Rejects testing-service links whose provider side lacks provider capability.';
