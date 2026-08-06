-- Migration 1.4: Create batch testing assignment table
-- One row records one portion of seed sent to a Testing organisation.
--
-- The portion is a bag, not a batch, but sub_batches does not exist until
-- 20260723000001. The bag key, its composite foreign key back to the parent
-- batch, and the one-active-assignment-per-bag index are therefore declared in
-- 20260804000001_secure_testing_assignments.sql, which runs after it.
--
-- The close timestamp is likewise still called returned_at here. Every RLS
-- policy written between this migration and 20260804000001 reads it by that
-- name, and a policy expression is parsed when it is created, so renaming it
-- any earlier would fail those migrations. 20260804000001 renames it to
-- closed_at and pairs it with the outcome below.

CREATE TABLE "public"."batch_testing_assignment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "assigned_to_org_id" "uuid" NOT NULL,
    "assigned_by_org_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "returned_at" timestamp with time zone,
    "outcome" "text" CHECK ("outcome" IN ('returned', 'consumed')),
    CONSTRAINT "batch_testing_assignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "batch_testing_assignment_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE CASCADE,
    CONSTRAINT "batch_testing_assignment_assigned_to_org_fkey" FOREIGN KEY ("assigned_to_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE,
    CONSTRAINT "batch_testing_assignment_assigned_by_org_fkey" FOREIGN KEY ("assigned_by_org_id") REFERENCES "public"."organisation"("id") ON DELETE CASCADE
);

-- Add indexes for common queries
CREATE INDEX "idx_batch_testing_assignment_batch_id" ON "public"."batch_testing_assignment" USING btree ("batch_id");
CREATE INDEX "idx_batch_testing_assignment_assigned_to_org" ON "public"."batch_testing_assignment" USING btree ("assigned_to_org_id");
CREATE INDEX "idx_batch_testing_assignment_assigned_by_org" ON "public"."batch_testing_assignment" USING btree ("assigned_by_org_id");
CREATE INDEX "idx_batch_testing_assignment_returned_at" ON "public"."batch_testing_assignment" USING btree ("returned_at");
CREATE INDEX "idx_batch_testing_assignment_completed_at" ON "public"."batch_testing_assignment" USING btree ("completed_at");

-- Add comments for documentation
COMMENT ON TABLE "public"."batch_testing_assignment" IS 'Tracks bags of seed assigned to Testing organisations for testing';
COMMENT ON COLUMN "public"."batch_testing_assignment"."completed_at" IS 'Timestamp when the first test was recorded against the assigned bag';
COMMENT ON COLUMN "public"."batch_testing_assignment"."returned_at" IS 'Renamed closed_at in 20260804000001: when the assignment ended, however it ended';
COMMENT ON COLUMN "public"."batch_testing_assignment"."outcome" IS 'How the assignment ended: returned (the bag came back) or consumed (testing used it up). NULL while active.';

-- Set table owner
ALTER TABLE "public"."batch_testing_assignment" OWNER TO "postgres";
