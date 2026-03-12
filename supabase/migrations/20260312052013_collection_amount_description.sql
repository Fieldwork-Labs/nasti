ALTER TABLE "public"."collection"
    DROP COLUMN "weight_estimate_kg",
    ADD COLUMN "amount_description" text;