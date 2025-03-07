alter table "public"."species" add column "ala_guid" text;

alter table "public"."species" add column "indigenous_name" text;

alter table "public"."species" add column "organisation_id" uuid not null;

alter table "public"."trip" add column "location_coordinate" geography(Point,4326);

alter table "public"."trip" add column "location_name" text;

CREATE UNIQUE INDEX idx_species_org_ala_guid ON public.species USING btree (organisation_id, ala_guid) WHERE (ala_guid IS NOT NULL);

alter table "public"."species" add constraint "fk_species_organisation" FOREIGN KEY (organisation_id) REFERENCES organisation(id) not valid;

alter table "public"."species" validate constraint "fk_species_organisation";
