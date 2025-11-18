-- Migration 1.4: Create batch testing assignment table
-- Tracks batches/samples sent to Testing organisations for testing/processing

CREATE TABLE "public"."batch_testing_assignment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "assigned_to_org_id" "uuid" NOT NULL,
    "assigned_by_org_id" "uuid" NOT NULL,
    "assignment_type" "text" NOT NULL CHECK ("assignment_type" IN ('sample', 'full_batch')),
    "sample_weight_grams" integer CHECK ("sample_weight_grams" > 0),
    "subsample_weight_grams" integer CHECK ("subsample_weight_grams" > 0),
    "subsample_storage_location_id" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "returned_at" timestamp with time zone,
    CONSTRAINT "batch_testing_assignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "batch_testing_assignment_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE CASCADE,
    CONSTRAINT "batch_testing_assignment_assigned_to_org_fkey" FOREIGN KEY ("assigned_to_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "batch_testing_assignment_assigned_by_org_fkey" FOREIGN KEY ("assigned_by_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "batch_testing_assignment_subsample_location_fkey" FOREIGN KEY ("subsample_storage_location_id") REFERENCES "public"."storage_locations"("id") ON DELETE SET NULL,
    CONSTRAINT "batch_testing_assignment_sample_weight_required" CHECK (
        ("assignment_type" = 'full_batch') OR
        ("assignment_type" = 'sample' AND "sample_weight_grams" IS NOT NULL)
    )
);

-- Add indexes for common queries
CREATE INDEX "idx_batch_testing_assignment_batch_id" ON "public"."batch_testing_assignment" USING btree ("batch_id");
CREATE INDEX "idx_batch_testing_assignment_assigned_to_org" ON "public"."batch_testing_assignment" USING btree ("assigned_to_org_id");
CREATE INDEX "idx_batch_testing_assignment_assigned_by_org" ON "public"."batch_testing_assignment" USING btree ("assigned_by_org_id");
CREATE INDEX "idx_batch_testing_assignment_returned_at" ON "public"."batch_testing_assignment" USING btree ("returned_at");
CREATE INDEX "idx_batch_testing_assignment_completed_at" ON "public"."batch_testing_assignment" USING btree ("completed_at");

-- Add comments for documentation
COMMENT ON TABLE "public"."batch_testing_assignment" IS 'Tracks batches/samples assigned to Testing organisations for testing/processing';
COMMENT ON COLUMN "public"."batch_testing_assignment"."assignment_type" IS 'Type of assignment: sample (partial weight sent) or full_batch (entire batch transferred)';
COMMENT ON COLUMN "public"."batch_testing_assignment"."sample_weight_grams" IS 'Weight of sample sent to testing org (required for sample type)';
COMMENT ON COLUMN "public"."batch_testing_assignment"."subsample_weight_grams" IS 'Weight of QA subsample retained by testing org for insurance';
COMMENT ON COLUMN "public"."batch_testing_assignment"."subsample_storage_location_id" IS 'Storage location of retained QA subsample';
COMMENT ON COLUMN "public"."batch_testing_assignment"."completed_at" IS 'Timestamp when test was recorded (moves to Inventory tab)';
COMMENT ON COLUMN "public"."batch_testing_assignment"."returned_at" IS 'Timestamp when batch/sample returned to owner (completes assignment)';

-- Set table owner
ALTER TABLE "public"."batch_testing_assignment" OWNER TO "postgres";
