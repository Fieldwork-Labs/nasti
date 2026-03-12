ALTER TABLE "public"."collection"
    DROP COLUMN "weight_estimate_kg",
    ADD COLUMN "amount_description" text,
    ADD COLUMN "collected_on" date;

UPDATE "public"."collection"
    SET "collected_on" = "created_at"::date;

ALTER TABLE "public"."collection"
    ALTER COLUMN "collected_on" SET DEFAULT CURRENT_DATE,
    ALTER COLUMN "collected_on" SET NOT NULL;