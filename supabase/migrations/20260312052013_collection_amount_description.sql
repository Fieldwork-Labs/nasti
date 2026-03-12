ALTER TABLE "public"."collection"
    DROP COLUMN "weight_estimate_kg",
    ADD COLUMN "amount_description" text,
    ADD COLUMN "collected_on" date,
    ADD COLUMN "collected_by" uuid REFERENCES "auth"."users"("id");

UPDATE "public"."collection"
    SET "collected_on" = "created_at"::date,
    SET "collected_by" = "created_by";

ALTER TABLE "public"."collection"
    ALTER COLUMN "collected_on" SET DEFAULT CURRENT_DATE,
    ALTER COLUMN "collected_on" SET NOT NULL,
    ALTER COLUMN "collected_by" SET NOT NULL,