create type "public"."batch_quality" as enum ('ORG', 'HQ', 'LQ');

create type "public"."batch_treatment_type" as enum ('sort', 'coat', 'treat', 'other');

create type "public"."batch_weight_adjustment_kind" as enum ('test_consumption', 'variance', 'split', 'merge', 'cleaning', 'correction');

create type "public"."container_purpose" as enum ('collection', 'storage');

create type "public"."org_permission" as enum ('collections', 'inventory');

create type "public"."seed_transfer_event_kind" as enum ('testing_dispatch', 'return', 'reversal', 'correction');

create type "public"."sub_batch_lineage_operation_kind" as enum ('split', 'merge', 'cleaning');

drop policy "Allow authenticated users to delete their own collections or ad" on "public"."collection";

drop policy "Allow authenticated users to insert collections for their organ" on "public"."collection";

drop policy "Allow authenticated users to select collections for their organ" on "public"."collection";

drop policy "Allow authenticated users to update their own collections or ad" on "public"."collection";

drop policy "collection_rls" on "public"."collection";

drop policy "Allow authenticated users to delete their own collection photos" on "public"."collection_photo";

drop policy "Allow authenticated users to insert collection photos" on "public"."collection_photo";

drop policy "Allow authenticated users to select their collection photos" on "public"."collection_photo";

drop policy "Allow authenticated users to update their own collection photos" on "public"."collection_photo";

drop policy "collection_photo_rls" on "public"."collection_photo";

drop policy "Deny all write operations on ibra_regions" on "public"."ibra_regions";

drop policy "invitation_rls" on "public"."invitation";

drop policy "org_user_rls" on "public"."org_user";

drop policy "organisation_rls" on "public"."organisation";

drop policy "Allow authenticated users to delete their own scouting_notess o" on "public"."scouting_notes";

drop policy "Allow authenticated users to insert scouting_notess for their o" on "public"."scouting_notes";

drop policy "Allow authenticated users to select scouting_notess for their o" on "public"."scouting_notes";

drop policy "Allow authenticated users to update their own scouting_notess o" on "public"."scouting_notes";

drop policy "Allow authenticated users to delete their own scouting_notes ph" on "public"."scouting_notes_photos";

drop policy "Allow authenticated users to insert scouting_notes photos" on "public"."scouting_notes_photos";

drop policy "Allow authenticated users to select their scouting_notes photos" on "public"."scouting_notes_photos";

drop policy "Allow authenticated users to update their own scouting_notes ph" on "public"."scouting_notes_photos";

drop policy "Allow authenticated users to delete species for their organisat" on "public"."species";

drop policy "Allow authenticated users to insert species for their organisat" on "public"."species";

drop policy "Allow authenticated users to select species for their organisat" on "public"."species";

drop policy "Allow authenticated users to update species for their organisat" on "public"."species";

drop policy "species_rls" on "public"."species";

drop policy "Allow authenticated users to delete species photos for their or" on "public"."species_photo";

drop policy "Allow authenticated users to insert species photos for their or" on "public"."species_photo";

drop policy "Allow authenticated users to select species photos for their or" on "public"."species_photo";

drop policy "Allow authenticated users to update species photos for their or" on "public"."species_photo";

drop policy "trip_rls" on "public"."trip";

drop policy "trip_member_rls" on "public"."trip_member";

drop policy "trip_species_rls" on "public"."trip_species";

revoke select on table "public"."collection" from "anon";

revoke select on table "public"."collection_audio" from "anon";

revoke select on table "public"."collection_photo" from "anon";

revoke select on table "public"."invitation" from "anon";

revoke select on table "public"."org_user" from "anon";

revoke select on table "public"."organisation" from "anon";

revoke select on table "public"."person" from "anon";

revoke select on table "public"."personnel" from "anon";

revoke select on table "public"."scouting_notes" from "anon";

revoke select on table "public"."scouting_notes_audio" from "anon";

revoke select on table "public"."scouting_notes_photos" from "anon";

revoke select on table "public"."species" from "anon";

revoke select on table "public"."species_photo" from "anon";

revoke select on table "public"."trip" from "anon";

revoke select on table "public"."trip_member" from "anon";

revoke select on table "public"."trip_species" from "anon";

drop function if exists "public"."generate_collection_code"(p_species_id uuid, p_field_name text, p_organisation_id uuid, p_location public.geography, p_created_at timestamp with time zone);

drop function if exists "public"."get_organisation_users"();


  create table "public"."batch_cleaning" (
    "id" uuid not null default gen_random_uuid(),
    "input_batch_id" uuid,
    "input_sub_batch_id" uuid,
    "material_type" text,
    "material_subtype" text,
    "material_notes" text,
    "is_cleaned" boolean not null default false,
    "cleaning_notes" text,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid,
    "organisation_id" uuid not null,
    "worker_ids" uuid[] not null default '{}'::uuid[],
    "duration" interval
      );


alter table "public"."batch_cleaning" enable row level security;


  create table "public"."batch_cleaning_output" (
    "id" uuid not null default gen_random_uuid(),
    "cleaning_id" uuid not null,
    "output_batch_id" uuid not null,
    "quality" text not null,
    "material_type" text not null,
    "weight_grams" numeric not null
      );


alter table "public"."batch_cleaning_output" enable row level security;


  create table "public"."batch_cleaning_photo" (
    "id" uuid not null default gen_random_uuid(),
    "cleaning_id" uuid not null,
    "stage" text not null,
    "url" text not null,
    "caption" text,
    "uploaded_at" timestamp with time zone not null default now(),
    "uploaded_by" uuid,
    "organisation_id" uuid not null
      );


alter table "public"."batch_cleaning_photo" enable row level security;


  create table "public"."batch_custody" (
    "id" uuid not null default gen_random_uuid(),
    "batch_id" uuid not null,
    "organisation_id" uuid not null,
    "received_at" timestamp with time zone not null default now(),
    "transferred_by" uuid,
    "previous_organisation_id" uuid,
    "notes" text
      );


alter table "public"."batch_custody" enable row level security;


  create table "public"."batch_merges" (
    "id" uuid not null default gen_random_uuid(),
    "merged_batch_id" uuid not null,
    "source_batch_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."batch_merges" enable row level security;


  create table "public"."batch_splits" (
    "id" uuid not null default gen_random_uuid(),
    "parent_batch_id" uuid not null,
    "child_batch_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."batch_splits" enable row level security;


  create table "public"."batch_storage" (
    "id" uuid not null default gen_random_uuid(),
    "batch_id" uuid not null,
    "location_id" uuid not null,
    "stored_at" timestamp with time zone default now(),
    "moved_out_at" timestamp with time zone,
    "notes" text,
    "created_at" timestamp(6) with time zone not null default now(),
    "sub_batch_id" uuid not null
      );


alter table "public"."batch_storage" enable row level security;


  create table "public"."batch_testing_assignment" (
    "id" uuid not null default gen_random_uuid(),
    "batch_id" uuid not null,
    "assigned_to_org_id" uuid not null,
    "assigned_by_org_id" uuid not null,
    "assigned_at" timestamp with time zone not null default now(),
    "completed_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "outcome" text,
    "sub_batch_id" uuid not null,
    "outbound_transfer_item_id" uuid not null,
    "work_closed_at" timestamp with time zone,
    "work_status" text,
    "work_status_note" text,
    "work_closed_by" uuid
      );


alter table "public"."batch_testing_assignment" enable row level security;


  create table "public"."batch_testing_assignment_return_item" (
    "assignment_id" uuid not null,
    "transfer_item_id" uuid not null,
    "created_at" timestamp with time zone not null default clock_timestamp()
      );


alter table "public"."batch_testing_assignment_return_item" enable row level security;


  create table "public"."batch_testing_assignment_status_audit" (
    "id" uuid not null default gen_random_uuid(),
    "assignment_id" uuid not null,
    "old_work_status" text,
    "new_work_status" text not null,
    "note" text,
    "actor_id" uuid not null,
    "recorded_at" timestamp with time zone not null default clock_timestamp()
      );


alter table "public"."batch_testing_assignment_status_audit" enable row level security;


  create table "public"."batch_weight_adjustments" (
    "id" uuid not null default gen_random_uuid(),
    "sub_batch_id" uuid not null,
    "weight_grams" numeric not null,
    "reason" text not null,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid,
    "kind" public.batch_weight_adjustment_kind not null default 'correction'::public.batch_weight_adjustment_kind,
    "test_id" uuid,
    "lineage_operation_id" uuid,
    "transfer_item_id" uuid,
    "corrects_adjustment_id" uuid
      );


alter table "public"."batch_weight_adjustments" enable row level security;


  create table "public"."batches" (
    "id" uuid not null default gen_random_uuid(),
    "collection_id" uuid,
    "organisation_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "weight_grams" numeric,
    "notes" text,
    "code" text
      );


alter table "public"."batches" enable row level security;


  create table "public"."collection_containers" (
    "id" uuid not null default gen_random_uuid(),
    "collection_id" uuid not null,
    "container_id" uuid not null,
    "amount" numeric,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."collection_containers" enable row level security;


  create table "public"."containers" (
    "id" uuid not null default gen_random_uuid(),
    "organisation_id" uuid not null,
    "name" text not null,
    "purpose" public.container_purpose not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."containers" enable row level security;


  create table "public"."organisation_link" (
    "id" uuid not null default gen_random_uuid(),
    "requesting_org_id" uuid not null,
    "provider_org_id" uuid not null,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."organisation_link" enable row level security;


  create table "public"."organisation_link_request" (
    "id" uuid not null default gen_random_uuid(),
    "requesting_org_id" uuid not null,
    "provider_org_id" uuid not null,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "accepted_by" uuid,
    "accepted_at" timestamp with time zone
      );


alter table "public"."organisation_link_request" enable row level security;


  create table "public"."seed_transfer_event" (
    "id" uuid not null default gen_random_uuid(),
    "sender_org_id" uuid not null,
    "recipient_org_id" uuid not null,
    "kind" public.seed_transfer_event_kind not null,
    "effective_at" timestamp with time zone not null default now(),
    "recorded_at" timestamp with time zone not null default now(),
    "recorded_by" uuid not null,
    "reverses_event_id" uuid,
    "corrects_event_id" uuid,
    "reason" text
      );


alter table "public"."seed_transfer_event" enable row level security;


  create table "public"."seed_transfer_item" (
    "id" uuid not null default gen_random_uuid(),
    "transfer_event_id" uuid not null,
    "sub_batch_id" uuid not null,
    "batch_id" uuid not null,
    "owner_org_id" uuid not null,
    "weight_grams" numeric not null
      );


alter table "public"."seed_transfer_item" enable row level security;


  create table "public"."storage_locations" (
    "id" uuid not null default gen_random_uuid(),
    "organisation_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone default now(),
    "active" boolean not null default true
      );


alter table "public"."storage_locations" enable row level security;


  create table "public"."sub_batch_lineage" (
    "id" uuid not null default gen_random_uuid(),
    "source_sub_batch_id" uuid not null,
    "derived_sub_batch_id" uuid not null,
    "operation_kind" public.sub_batch_lineage_operation_kind not null,
    "operation_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid()
      );


alter table "public"."sub_batch_lineage" enable row level security;


  create table "public"."sub_batches" (
    "id" uuid not null default gen_random_uuid(),
    "batch_id" uuid not null,
    "weight_grams" numeric not null,
    "notes" text,
    "created_at" timestamp with time zone default now(),
    "held_by_org_id" uuid not null,
    "container_id" uuid
      );


alter table "public"."sub_batches" enable row level security;


  create table "public"."tests" (
    "id" uuid not null default gen_random_uuid(),
    "batch_id" uuid not null,
    "type" text not null,
    "result" jsonb,
    "tested_at" timestamp with time zone default now(),
    "tested_by" uuid,
    "statistics" jsonb,
    "performed_by_organisation_id" uuid,
    "sub_batch_id" uuid not null
      );


alter table "public"."tests" enable row level security;


  create table "public"."treatments" (
    "id" uuid not null default gen_random_uuid(),
    "input_batch_id" uuid,
    "output_batch_id" uuid not null,
    "treat" jsonb not null,
    "quality_assessment" public.batch_quality not null,
    "notes" text,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid,
    "organisation_id" uuid not null
      );


alter table "public"."treatments" enable row level security;

alter table "public"."collection" drop column "amount_quantity";

alter table "public"."collection" drop column "amount_units";

alter table "public"."invitation" add column "permissions" public.org_permission[] not null default '{}'::public.org_permission[];

alter table "public"."org_user" add column "permissions" public.org_permission[] not null default '{}'::public.org_permission[];

alter table "public"."organisation" add column "is_testing_provider" boolean not null default false;

alter table "public"."scouting_notes" enable row level security;

alter table "public"."scouting_notes_photos" enable row level security;

CREATE UNIQUE INDEX batch_cleaning_output_pkey ON public.batch_cleaning_output USING btree (id);

CREATE INDEX batch_cleaning_photo_cleaning_id_idx ON public.batch_cleaning_photo USING btree (cleaning_id, stage);

CREATE INDEX batch_cleaning_photo_organisation_id_idx ON public.batch_cleaning_photo USING btree (organisation_id);

CREATE UNIQUE INDEX batch_cleaning_photo_pkey ON public.batch_cleaning_photo USING btree (id);

CREATE UNIQUE INDEX batch_cleaning_pkey ON public.batch_cleaning USING btree (id);

CREATE INDEX batch_cleaning_worker_ids_idx ON public.batch_cleaning USING gin (worker_ids);

CREATE UNIQUE INDEX batch_custody_batch_id_organisation_id_received_at_key ON public.batch_custody USING btree (batch_id, organisation_id, received_at);

CREATE UNIQUE INDEX batch_custody_pkey ON public.batch_custody USING btree (id);

CREATE UNIQUE INDEX batch_merges_pkey ON public.batch_merges USING btree (id);

CREATE UNIQUE INDEX batch_splits_pkey ON public.batch_splits USING btree (id);

CREATE UNIQUE INDEX batch_storage_one_open_row_per_sub_batch_idx ON public.batch_storage USING btree (sub_batch_id) WHERE (moved_out_at IS NULL);

CREATE UNIQUE INDEX batch_storage_pkey ON public.batch_storage USING btree (id);

CREATE UNIQUE INDEX batch_testing_assignment_one_active_per_bag ON public.batch_testing_assignment USING btree (sub_batch_id) WHERE (closed_at IS NULL);

CREATE UNIQUE INDEX batch_testing_assignment_outbound_transfer_item_id_key ON public.batch_testing_assignment USING btree (outbound_transfer_item_id);

CREATE UNIQUE INDEX batch_testing_assignment_pkey ON public.batch_testing_assignment USING btree (id);

CREATE UNIQUE INDEX batch_testing_assignment_return_item_pkey ON public.batch_testing_assignment_return_item USING btree (assignment_id, transfer_item_id);

CREATE INDEX batch_testing_assignment_return_item_transfer_idx ON public.batch_testing_assignment_return_item USING btree (transfer_item_id);

CREATE INDEX batch_testing_assignment_status_audit_assignment_idx ON public.batch_testing_assignment_status_audit USING btree (assignment_id, recorded_at, id);

CREATE UNIQUE INDEX batch_testing_assignment_status_audit_pkey ON public.batch_testing_assignment_status_audit USING btree (id);

CREATE UNIQUE INDEX batch_weight_adjustments_pkey ON public.batch_weight_adjustments USING btree (id);

CREATE UNIQUE INDEX batches_pkey ON public.batches USING btree (id);

CREATE UNIQUE INDEX collection_code_org_unique_idx ON public.collection USING btree (code, organisation_id) WHERE (code IS NOT NULL);

CREATE UNIQUE INDEX collection_containers_collection_id_container_id_key ON public.collection_containers USING btree (collection_id, container_id);

CREATE INDEX collection_containers_collection_id_idx ON public.collection_containers USING btree (collection_id);

CREATE INDEX collection_containers_container_id_idx ON public.collection_containers USING btree (container_id);

CREATE UNIQUE INDEX collection_containers_pkey ON public.collection_containers USING btree (id);

CREATE INDEX containers_organisation_id_idx ON public.containers USING btree (organisation_id);

CREATE UNIQUE INDEX containers_organisation_name_purpose_key ON public.containers USING btree (organisation_id, lower(btrim(name)), purpose);

CREATE UNIQUE INDEX containers_pkey ON public.containers USING btree (id);

CREATE INDEX idx_batch_cleaning_input_batch ON public.batch_cleaning USING btree (input_batch_id);

CREATE INDEX idx_batch_cleaning_input_sub_batch ON public.batch_cleaning USING btree (input_sub_batch_id);

CREATE INDEX idx_batch_cleaning_output_batch ON public.batch_cleaning_output USING btree (output_batch_id);

CREATE INDEX idx_batch_cleaning_output_cleaning ON public.batch_cleaning_output USING btree (cleaning_id);

CREATE INDEX idx_batch_storage_created_at ON public.batch_storage USING btree (created_at DESC);

CREATE INDEX idx_batch_storage_sub_batch_id ON public.batch_storage USING btree (sub_batch_id);

CREATE INDEX idx_batch_testing_assignment_assigned_by_org ON public.batch_testing_assignment USING btree (assigned_by_org_id);

CREATE INDEX idx_batch_testing_assignment_assigned_to_org ON public.batch_testing_assignment USING btree (assigned_to_org_id);

CREATE INDEX idx_batch_testing_assignment_batch_id ON public.batch_testing_assignment USING btree (batch_id);

CREATE INDEX idx_batch_testing_assignment_closed_at ON public.batch_testing_assignment USING btree (closed_at);

CREATE INDEX idx_batch_testing_assignment_completed_at ON public.batch_testing_assignment USING btree (completed_at);

CREATE INDEX idx_batch_testing_assignment_sub_batch_id ON public.batch_testing_assignment USING btree (sub_batch_id);

CREATE INDEX idx_batch_testing_assignment_work_open ON public.batch_testing_assignment USING btree (assigned_to_org_id, assigned_at) WHERE (work_closed_at IS NULL);

CREATE INDEX idx_batch_weight_adjustments_corrects ON public.batch_weight_adjustments USING btree (corrects_adjustment_id) WHERE (corrects_adjustment_id IS NOT NULL);

CREATE INDEX idx_batch_weight_adjustments_lineage_operation ON public.batch_weight_adjustments USING btree (lineage_operation_id) WHERE (lineage_operation_id IS NOT NULL);

CREATE INDEX idx_batch_weight_adjustments_sub_batch_id ON public.batch_weight_adjustments USING btree (sub_batch_id);

CREATE INDEX idx_batch_weight_adjustments_test ON public.batch_weight_adjustments USING btree (test_id) WHERE (test_id IS NOT NULL);

CREATE INDEX idx_batch_weight_adjustments_transfer_item ON public.batch_weight_adjustments USING btree (transfer_item_id) WHERE (transfer_item_id IS NOT NULL);

CREATE INDEX idx_batches_code ON public.batches USING btree (code);

CREATE INDEX idx_organisation_is_testing_provider ON public.organisation USING btree (is_testing_provider) WHERE is_testing_provider;

CREATE INDEX idx_organisation_link_provider_org ON public.organisation_link USING btree (provider_org_id);

CREATE INDEX idx_organisation_link_request_accepted_at ON public.organisation_link_request USING btree (accepted_at);

CREATE INDEX idx_organisation_link_request_provider ON public.organisation_link_request USING btree (provider_org_id);

CREATE INDEX idx_organisation_link_request_requester ON public.organisation_link_request USING btree (requesting_org_id);

CREATE INDEX idx_organisation_link_requesting_org ON public.organisation_link USING btree (requesting_org_id);

CREATE INDEX idx_seed_transfer_event_corrects ON public.seed_transfer_event USING btree (corrects_event_id) WHERE (corrects_event_id IS NOT NULL);

CREATE INDEX idx_seed_transfer_event_recipient ON public.seed_transfer_event USING btree (recipient_org_id, effective_at DESC);

CREATE INDEX idx_seed_transfer_event_reverses ON public.seed_transfer_event USING btree (reverses_event_id) WHERE (reverses_event_id IS NOT NULL);

CREATE INDEX idx_seed_transfer_event_sender ON public.seed_transfer_event USING btree (sender_org_id, effective_at DESC);

CREATE INDEX idx_seed_transfer_item_bag ON public.seed_transfer_item USING btree (sub_batch_id);

CREATE INDEX idx_seed_transfer_item_batch_owner ON public.seed_transfer_item USING btree (batch_id, owner_org_id);

CREATE INDEX idx_seed_transfer_item_event ON public.seed_transfer_item USING btree (transfer_event_id);

CREATE INDEX idx_sub_batches_batch_id ON public.sub_batches USING btree (batch_id);

CREATE INDEX idx_tests_batch_id ON public.tests USING btree (batch_id);

CREATE INDEX idx_tests_performed_by_organisation ON public.tests USING btree (performed_by_organisation_id);

CREATE INDEX idx_tests_statistics ON public.tests USING gin (statistics);

CREATE INDEX idx_treatments_input_batch ON public.treatments USING btree (input_batch_id);

CREATE INDEX idx_treatments_output_batch ON public.treatments USING btree (output_batch_id);

CREATE UNIQUE INDEX organisation_link_pkey ON public.organisation_link USING btree (id);

CREATE UNIQUE INDEX organisation_link_request_pkey ON public.organisation_link_request USING btree (id);

CREATE UNIQUE INDEX organisation_link_unique ON public.organisation_link USING btree (requesting_org_id, provider_org_id);

CREATE UNIQUE INDEX seed_transfer_event_pkey ON public.seed_transfer_event USING btree (id);

CREATE UNIQUE INDEX seed_transfer_item_composite_identity ON public.seed_transfer_item USING btree (id, sub_batch_id, batch_id);

CREATE UNIQUE INDEX seed_transfer_item_pkey ON public.seed_transfer_item USING btree (id);

CREATE UNIQUE INDEX storage_locations_pkey ON public.storage_locations USING btree (id);

CREATE INDEX sub_batch_lineage_derived_idx ON public.sub_batch_lineage USING btree (derived_sub_batch_id);

CREATE INDEX sub_batch_lineage_operation_idx ON public.sub_batch_lineage USING btree (operation_kind, operation_id);

CREATE UNIQUE INDEX sub_batch_lineage_pkey ON public.sub_batch_lineage USING btree (id);

CREATE INDEX sub_batch_lineage_source_idx ON public.sub_batch_lineage USING btree (source_sub_batch_id);

CREATE UNIQUE INDEX sub_batch_lineage_unique_edge ON public.sub_batch_lineage USING btree (source_sub_batch_id, derived_sub_batch_id, operation_kind, operation_id);

CREATE INDEX sub_batches_container_id_idx ON public.sub_batches USING btree (container_id);

CREATE INDEX sub_batches_held_by_org_id_idx ON public.sub_batches USING btree (held_by_org_id);

CREATE UNIQUE INDEX sub_batches_id_batch_id_key ON public.sub_batches USING btree (id, batch_id);

CREATE UNIQUE INDEX sub_batches_pkey ON public.sub_batches USING btree (id);

CREATE UNIQUE INDEX tests_pkey ON public.tests USING btree (id);

CREATE UNIQUE INDEX treatments_pkey ON public.treatments USING btree (id);

alter table "public"."batch_cleaning" add constraint "batch_cleaning_pkey" PRIMARY KEY using index "batch_cleaning_pkey";

alter table "public"."batch_cleaning_output" add constraint "batch_cleaning_output_pkey" PRIMARY KEY using index "batch_cleaning_output_pkey";

alter table "public"."batch_cleaning_photo" add constraint "batch_cleaning_photo_pkey" PRIMARY KEY using index "batch_cleaning_photo_pkey";

alter table "public"."batch_custody" add constraint "batch_custody_pkey" PRIMARY KEY using index "batch_custody_pkey";

alter table "public"."batch_merges" add constraint "batch_merges_pkey" PRIMARY KEY using index "batch_merges_pkey";

alter table "public"."batch_splits" add constraint "batch_splits_pkey" PRIMARY KEY using index "batch_splits_pkey";

alter table "public"."batch_storage" add constraint "batch_storage_pkey" PRIMARY KEY using index "batch_storage_pkey";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_pkey" PRIMARY KEY using index "batch_testing_assignment_pkey";

alter table "public"."batch_testing_assignment_return_item" add constraint "batch_testing_assignment_return_item_pkey" PRIMARY KEY using index "batch_testing_assignment_return_item_pkey";

alter table "public"."batch_testing_assignment_status_audit" add constraint "batch_testing_assignment_status_audit_pkey" PRIMARY KEY using index "batch_testing_assignment_status_audit_pkey";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustments_pkey" PRIMARY KEY using index "batch_weight_adjustments_pkey";

alter table "public"."batches" add constraint "batches_pkey" PRIMARY KEY using index "batches_pkey";

alter table "public"."collection_containers" add constraint "collection_containers_pkey" PRIMARY KEY using index "collection_containers_pkey";

alter table "public"."containers" add constraint "containers_pkey" PRIMARY KEY using index "containers_pkey";

alter table "public"."organisation_link" add constraint "organisation_link_pkey" PRIMARY KEY using index "organisation_link_pkey";

alter table "public"."organisation_link_request" add constraint "organisation_link_request_pkey" PRIMARY KEY using index "organisation_link_request_pkey";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_pkey" PRIMARY KEY using index "seed_transfer_event_pkey";

alter table "public"."seed_transfer_item" add constraint "seed_transfer_item_pkey" PRIMARY KEY using index "seed_transfer_item_pkey";

alter table "public"."storage_locations" add constraint "storage_locations_pkey" PRIMARY KEY using index "storage_locations_pkey";

alter table "public"."sub_batch_lineage" add constraint "sub_batch_lineage_pkey" PRIMARY KEY using index "sub_batch_lineage_pkey";

alter table "public"."sub_batches" add constraint "sub_batches_pkey" PRIMARY KEY using index "sub_batches_pkey";

alter table "public"."tests" add constraint "tests_pkey" PRIMARY KEY using index "tests_pkey";

alter table "public"."treatments" add constraint "treatments_pkey" PRIMARY KEY using index "treatments_pkey";

alter table "public"."batch_cleaning" add constraint "batch_cleaning_cleaned_duration_required" CHECK (((NOT is_cleaned) OR (duration IS NOT NULL))) not valid;

alter table "public"."batch_cleaning" validate constraint "batch_cleaning_cleaned_duration_required";

alter table "public"."batch_cleaning" add constraint "batch_cleaning_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."batch_cleaning" validate constraint "batch_cleaning_created_by_fkey";

alter table "public"."batch_cleaning" add constraint "batch_cleaning_input_batch_id_fkey" FOREIGN KEY (input_batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_cleaning" validate constraint "batch_cleaning_input_batch_id_fkey";

alter table "public"."batch_cleaning" add constraint "batch_cleaning_input_sub_batch_id_fkey" FOREIGN KEY (input_sub_batch_id) REFERENCES public.sub_batches(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_cleaning" validate constraint "batch_cleaning_input_sub_batch_id_fkey";

alter table "public"."batch_cleaning" add constraint "batch_cleaning_material_type_check" CHECK ((material_type = ANY (ARRAY['seed'::text, 'covering_structure'::text]))) not valid;

alter table "public"."batch_cleaning" validate constraint "batch_cleaning_material_type_check";

alter table "public"."batch_cleaning" add constraint "batch_cleaning_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES public.organisation(id) not valid;

alter table "public"."batch_cleaning" validate constraint "batch_cleaning_organisation_id_fkey";

alter table "public"."batch_cleaning_output" add constraint "batch_cleaning_output_cleaning_id_fkey" FOREIGN KEY (cleaning_id) REFERENCES public.batch_cleaning(id) ON DELETE CASCADE not valid;

alter table "public"."batch_cleaning_output" validate constraint "batch_cleaning_output_cleaning_id_fkey";

alter table "public"."batch_cleaning_output" add constraint "batch_cleaning_output_material_type_check" CHECK ((material_type = ANY (ARRAY['seed'::text, 'covering_structure'::text]))) not valid;

alter table "public"."batch_cleaning_output" validate constraint "batch_cleaning_output_material_type_check";

alter table "public"."batch_cleaning_output" add constraint "batch_cleaning_output_output_batch_id_fkey" FOREIGN KEY (output_batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_cleaning_output" validate constraint "batch_cleaning_output_output_batch_id_fkey";

alter table "public"."batch_cleaning_output" add constraint "batch_cleaning_output_quality_check" CHECK ((quality = ANY (ARRAY['ORG'::text, 'HQ'::text, 'LQ'::text]))) not valid;

alter table "public"."batch_cleaning_output" validate constraint "batch_cleaning_output_quality_check";

alter table "public"."batch_cleaning_output" add constraint "batch_cleaning_output_weight_grams_check" CHECK ((weight_grams > (0)::numeric)) not valid;

alter table "public"."batch_cleaning_output" validate constraint "batch_cleaning_output_weight_grams_check";

alter table "public"."batch_cleaning_photo" add constraint "batch_cleaning_photo_cleaning_id_fkey" FOREIGN KEY (cleaning_id) REFERENCES public.batch_cleaning(id) ON DELETE CASCADE not valid;

alter table "public"."batch_cleaning_photo" validate constraint "batch_cleaning_photo_cleaning_id_fkey";

alter table "public"."batch_cleaning_photo" add constraint "batch_cleaning_photo_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."batch_cleaning_photo" validate constraint "batch_cleaning_photo_organisation_id_fkey";

alter table "public"."batch_cleaning_photo" add constraint "batch_cleaning_photo_stage_check" CHECK ((stage = ANY (ARRAY['before'::text, 'after'::text]))) not valid;

alter table "public"."batch_cleaning_photo" validate constraint "batch_cleaning_photo_stage_check";

alter table "public"."batch_cleaning_photo" add constraint "batch_cleaning_photo_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) not valid;

alter table "public"."batch_cleaning_photo" validate constraint "batch_cleaning_photo_uploaded_by_fkey";

alter table "public"."batch_custody" add constraint "batch_custody_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE not valid;

alter table "public"."batch_custody" validate constraint "batch_custody_batch_id_fkey";

alter table "public"."batch_custody" add constraint "batch_custody_batch_id_organisation_id_received_at_key" UNIQUE using index "batch_custody_batch_id_organisation_id_received_at_key";

alter table "public"."batch_custody" add constraint "batch_custody_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES public.organisation(id) not valid;

alter table "public"."batch_custody" validate constraint "batch_custody_organisation_id_fkey";

alter table "public"."batch_custody" add constraint "batch_custody_previous_organisation_id_fkey" FOREIGN KEY (previous_organisation_id) REFERENCES public.organisation(id) not valid;

alter table "public"."batch_custody" validate constraint "batch_custody_previous_organisation_id_fkey";

alter table "public"."batch_custody" add constraint "batch_custody_transferred_by_fkey" FOREIGN KEY (transferred_by) REFERENCES auth.users(id) not valid;

alter table "public"."batch_custody" validate constraint "batch_custody_transferred_by_fkey";

alter table "public"."batch_merges" add constraint "batch_merges_merged_batch_id_fkey" FOREIGN KEY (merged_batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_merges" validate constraint "batch_merges_merged_batch_id_fkey";

alter table "public"."batch_merges" add constraint "batch_merges_source_batch_id_fkey" FOREIGN KEY (source_batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_merges" validate constraint "batch_merges_source_batch_id_fkey";

alter table "public"."batch_splits" add constraint "batch_splits_child_batch_id_fkey" FOREIGN KEY (child_batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_splits" validate constraint "batch_splits_child_batch_id_fkey";

alter table "public"."batch_splits" add constraint "batch_splits_parent_batch_id_fkey" FOREIGN KEY (parent_batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_splits" validate constraint "batch_splits_parent_batch_id_fkey";

alter table "public"."batch_storage" add constraint "batch_storage_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE not valid;

alter table "public"."batch_storage" validate constraint "batch_storage_batch_id_fkey";

alter table "public"."batch_storage" add constraint "batch_storage_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.storage_locations(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_storage" validate constraint "batch_storage_location_id_fkey";

alter table "public"."batch_storage" add constraint "batch_storage_sub_batch_id_fkey" FOREIGN KEY (sub_batch_id) REFERENCES public.sub_batches(id) ON DELETE CASCADE not valid;

alter table "public"."batch_storage" validate constraint "batch_storage_sub_batch_id_fkey";

alter table "public"."batch_storage" add constraint "batch_storage_sub_batch_matches_batch_fkey" FOREIGN KEY (sub_batch_id, batch_id) REFERENCES public.sub_batches(id, batch_id) ON DELETE CASCADE not valid;

alter table "public"."batch_storage" validate constraint "batch_storage_sub_batch_matches_batch_fkey";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_assigned_by_org_fkey" FOREIGN KEY (assigned_by_org_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_assigned_by_org_fkey";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_assigned_to_org_fkey" FOREIGN KEY (assigned_to_org_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_assigned_to_org_fkey";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_batch_fkey" FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_batch_fkey";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_incomplete_work_has_note" CHECK (((work_status <> ALL (ARRAY['partially_completed'::text, 'not_completed'::text])) OR (NULLIF(btrim(work_status_note), ''::text) IS NOT NULL))) not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_incomplete_work_has_note";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_outbound_transfer_item_id_key" UNIQUE using index "batch_testing_assignment_outbound_transfer_item_id_key";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_outcome_check" CHECK ((outcome = ANY (ARRAY['returned'::text, 'consumed'::text]))) not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_outcome_check";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_outcome_matches_closed" CHECK (((closed_at IS NULL) = (outcome IS NULL))) not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_outcome_matches_closed";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_sub_batch_matches_batch_fkey" FOREIGN KEY (sub_batch_id, batch_id) REFERENCES public.sub_batches(id, batch_id) ON DELETE CASCADE not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_sub_batch_matches_batch_fkey";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_transfer_item_matches_bag_fkey" FOREIGN KEY (outbound_transfer_item_id, sub_batch_id, batch_id) REFERENCES public.seed_transfer_item(id, sub_batch_id, batch_id) ON DELETE RESTRICT not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_transfer_item_matches_bag_fkey";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_work_closed_by_fkey" FOREIGN KEY (work_closed_by) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_work_closed_by_fkey";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_work_closure_complete" CHECK ((((work_closed_at IS NULL) AND (work_status IS NULL) AND (work_status_note IS NULL) AND (work_closed_by IS NULL)) OR ((work_closed_at IS NOT NULL) AND (work_status IS NOT NULL) AND (work_closed_by IS NOT NULL)))) not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_work_closure_complete";

alter table "public"."batch_testing_assignment" add constraint "batch_testing_assignment_work_status_valid" CHECK (((work_status IS NULL) OR (work_status = ANY (ARRAY['completed'::text, 'partially_completed'::text, 'not_completed'::text])))) not valid;

alter table "public"."batch_testing_assignment" validate constraint "batch_testing_assignment_work_status_valid";

alter table "public"."batch_testing_assignment_return_item" add constraint "batch_testing_assignment_return_item_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.batch_testing_assignment(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_testing_assignment_return_item" validate constraint "batch_testing_assignment_return_item_assignment_id_fkey";

alter table "public"."batch_testing_assignment_return_item" add constraint "batch_testing_assignment_return_item_transfer_item_id_fkey" FOREIGN KEY (transfer_item_id) REFERENCES public.seed_transfer_item(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_testing_assignment_return_item" validate constraint "batch_testing_assignment_return_item_transfer_item_id_fkey";

alter table "public"."batch_testing_assignment_status_audit" add constraint "batch_testing_assignment_status_audit_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_testing_assignment_status_audit" validate constraint "batch_testing_assignment_status_audit_actor_id_fkey";

alter table "public"."batch_testing_assignment_status_audit" add constraint "batch_testing_assignment_status_audit_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES public.batch_testing_assignment(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_testing_assignment_status_audit" validate constraint "batch_testing_assignment_status_audit_assignment_id_fkey";

alter table "public"."batch_testing_assignment_status_audit" add constraint "batch_testing_assignment_status_audit_incomplete_has_note" CHECK (((new_work_status <> ALL (ARRAY['partially_completed'::text, 'not_completed'::text])) OR (NULLIF(btrim(note), ''::text) IS NOT NULL))) not valid;

alter table "public"."batch_testing_assignment_status_audit" validate constraint "batch_testing_assignment_status_audit_incomplete_has_note";

alter table "public"."batch_testing_assignment_status_audit" add constraint "batch_testing_assignment_status_audit_new_valid" CHECK ((new_work_status = ANY (ARRAY['completed'::text, 'partially_completed'::text, 'not_completed'::text]))) not valid;

alter table "public"."batch_testing_assignment_status_audit" validate constraint "batch_testing_assignment_status_audit_new_valid";

alter table "public"."batch_testing_assignment_status_audit" add constraint "batch_testing_assignment_status_audit_old_valid" CHECK (((old_work_status IS NULL) OR (old_work_status = ANY (ARRAY['completed'::text, 'partially_completed'::text, 'not_completed'::text])))) not valid;

alter table "public"."batch_testing_assignment_status_audit" validate constraint "batch_testing_assignment_status_audit_old_valid";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustment_not_self_correcting" CHECK ((id IS DISTINCT FROM corrects_adjustment_id)) not valid;

alter table "public"."batch_weight_adjustments" validate constraint "batch_weight_adjustment_not_self_correcting";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustment_reference_shape" CHECK ((((kind = 'test_consumption'::public.batch_weight_adjustment_kind) AND (test_id IS NOT NULL) AND (lineage_operation_id IS NULL) AND (transfer_item_id IS NULL) AND (corrects_adjustment_id IS NULL)) OR ((kind = ANY (ARRAY['split'::public.batch_weight_adjustment_kind, 'merge'::public.batch_weight_adjustment_kind, 'cleaning'::public.batch_weight_adjustment_kind])) AND (test_id IS NULL) AND (lineage_operation_id IS NOT NULL) AND (transfer_item_id IS NULL) AND (corrects_adjustment_id IS NULL)) OR ((kind = 'variance'::public.batch_weight_adjustment_kind) AND (test_id IS NULL) AND (lineage_operation_id IS NULL) AND (transfer_item_id IS NOT NULL) AND (corrects_adjustment_id IS NULL)) OR ((kind = 'correction'::public.batch_weight_adjustment_kind) AND (test_id IS NULL) AND (lineage_operation_id IS NULL) AND (transfer_item_id IS NULL)))) not valid;

alter table "public"."batch_weight_adjustments" validate constraint "batch_weight_adjustment_reference_shape";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustments_corrects_adjustment_id_fkey" FOREIGN KEY (corrects_adjustment_id) REFERENCES public.batch_weight_adjustments(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_weight_adjustments" validate constraint "batch_weight_adjustments_corrects_adjustment_id_fkey";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."batch_weight_adjustments" validate constraint "batch_weight_adjustments_created_by_fkey";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustments_reason_check" CHECK ((length(TRIM(BOTH FROM reason)) > 0)) not valid;

alter table "public"."batch_weight_adjustments" validate constraint "batch_weight_adjustments_reason_check";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustments_sub_batch_id_fkey" FOREIGN KEY (sub_batch_id) REFERENCES public.sub_batches(id) ON DELETE CASCADE not valid;

alter table "public"."batch_weight_adjustments" validate constraint "batch_weight_adjustments_sub_batch_id_fkey";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustments_test_id_fkey" FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_weight_adjustments" validate constraint "batch_weight_adjustments_test_id_fkey";

alter table "public"."batch_weight_adjustments" add constraint "batch_weight_adjustments_transfer_item_id_fkey" FOREIGN KEY (transfer_item_id) REFERENCES public.seed_transfer_item(id) ON DELETE RESTRICT not valid;

alter table "public"."batch_weight_adjustments" validate constraint "batch_weight_adjustments_transfer_item_id_fkey";

alter table "public"."batches" add constraint "batches_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES public.collection(id) ON DELETE CASCADE not valid;

alter table "public"."batches" validate constraint "batches_collection_id_fkey";

alter table "public"."batches" add constraint "batches_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."batches" validate constraint "batches_organisation_id_fkey";

alter table "public"."batches" add constraint "batches_weight_grams_check" CHECK (((weight_grams > (0)::numeric) OR (weight_grams IS NULL))) not valid;

alter table "public"."batches" validate constraint "batches_weight_grams_check";

alter table "public"."collection_containers" add constraint "collection_containers_amount_check" CHECK (((amount IS NULL) OR (amount > (0)::numeric))) not valid;

alter table "public"."collection_containers" validate constraint "collection_containers_amount_check";

alter table "public"."collection_containers" add constraint "collection_containers_collection_id_container_id_key" UNIQUE using index "collection_containers_collection_id_container_id_key";

alter table "public"."collection_containers" add constraint "collection_containers_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES public.collection(id) ON DELETE CASCADE not valid;

alter table "public"."collection_containers" validate constraint "collection_containers_collection_id_fkey";

alter table "public"."collection_containers" add constraint "collection_containers_container_id_fkey" FOREIGN KEY (container_id) REFERENCES public.containers(id) ON DELETE RESTRICT not valid;

alter table "public"."collection_containers" validate constraint "collection_containers_container_id_fkey";

alter table "public"."containers" add constraint "containers_name_check" CHECK ((btrim(name) <> ''::text)) not valid;

alter table "public"."containers" validate constraint "containers_name_check";

alter table "public"."containers" add constraint "containers_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."containers" validate constraint "containers_organisation_id_fkey";

alter table "public"."organisation_link" add constraint "organisation_link_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."organisation_link" validate constraint "organisation_link_created_by_fkey";

alter table "public"."organisation_link" add constraint "organisation_link_distinct_orgs" CHECK ((requesting_org_id <> provider_org_id)) not valid;

alter table "public"."organisation_link" validate constraint "organisation_link_distinct_orgs";

alter table "public"."organisation_link" add constraint "organisation_link_provider_fkey" FOREIGN KEY (provider_org_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."organisation_link" validate constraint "organisation_link_provider_fkey";

alter table "public"."organisation_link" add constraint "organisation_link_requester_fkey" FOREIGN KEY (requesting_org_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."organisation_link" validate constraint "organisation_link_requester_fkey";

alter table "public"."organisation_link" add constraint "organisation_link_unique" UNIQUE using index "organisation_link_unique";

alter table "public"."organisation_link_request" add constraint "organisation_link_request_accepted_by_fkey" FOREIGN KEY (accepted_by) REFERENCES auth.users(id) not valid;

alter table "public"."organisation_link_request" validate constraint "organisation_link_request_accepted_by_fkey";

alter table "public"."organisation_link_request" add constraint "organisation_link_request_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."organisation_link_request" validate constraint "organisation_link_request_created_by_fkey";

alter table "public"."organisation_link_request" add constraint "organisation_link_request_distinct_orgs" CHECK ((requesting_org_id <> provider_org_id)) not valid;

alter table "public"."organisation_link_request" validate constraint "organisation_link_request_distinct_orgs";

alter table "public"."organisation_link_request" add constraint "organisation_link_request_provider_fkey" FOREIGN KEY (provider_org_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."organisation_link_request" validate constraint "organisation_link_request_provider_fkey";

alter table "public"."organisation_link_request" add constraint "organisation_link_request_requester_fkey" FOREIGN KEY (requesting_org_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."organisation_link_request" validate constraint "organisation_link_request_requester_fkey";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_corrects_event_id_fkey" FOREIGN KEY (corrects_event_id) REFERENCES public.seed_transfer_event(id) ON DELETE RESTRICT not valid;

alter table "public"."seed_transfer_event" validate constraint "seed_transfer_event_corrects_event_id_fkey";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_distinct_parties" CHECK ((sender_org_id <> recipient_org_id)) not valid;

alter table "public"."seed_transfer_event" validate constraint "seed_transfer_event_distinct_parties";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_not_self_referential" CHECK (((id IS DISTINCT FROM reverses_event_id) AND (id IS DISTINCT FROM corrects_event_id))) not valid;

alter table "public"."seed_transfer_event" validate constraint "seed_transfer_event_not_self_referential";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_recipient_org_id_fkey" FOREIGN KEY (recipient_org_id) REFERENCES public.organisation(id) ON DELETE RESTRICT not valid;

alter table "public"."seed_transfer_event" validate constraint "seed_transfer_event_recipient_org_id_fkey";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."seed_transfer_event" validate constraint "seed_transfer_event_recorded_by_fkey";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_reference_shape" CHECK ((((kind = 'reversal'::public.seed_transfer_event_kind) AND (reverses_event_id IS NOT NULL) AND (corrects_event_id IS NULL) AND (NULLIF(btrim(reason), ''::text) IS NOT NULL)) OR ((kind = 'correction'::public.seed_transfer_event_kind) AND (corrects_event_id IS NOT NULL) AND (reverses_event_id IS NULL) AND (NULLIF(btrim(reason), ''::text) IS NOT NULL)) OR ((kind = ANY (ARRAY['testing_dispatch'::public.seed_transfer_event_kind, 'return'::public.seed_transfer_event_kind])) AND (reverses_event_id IS NULL) AND (corrects_event_id IS NULL)))) not valid;

alter table "public"."seed_transfer_event" validate constraint "seed_transfer_event_reference_shape";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_reverses_event_id_fkey" FOREIGN KEY (reverses_event_id) REFERENCES public.seed_transfer_event(id) ON DELETE RESTRICT not valid;

alter table "public"."seed_transfer_event" validate constraint "seed_transfer_event_reverses_event_id_fkey";

alter table "public"."seed_transfer_event" add constraint "seed_transfer_event_sender_org_id_fkey" FOREIGN KEY (sender_org_id) REFERENCES public.organisation(id) ON DELETE RESTRICT not valid;

alter table "public"."seed_transfer_event" validate constraint "seed_transfer_event_sender_org_id_fkey";

alter table "public"."seed_transfer_item" add constraint "seed_transfer_item_bag_matches_batch_fkey" FOREIGN KEY (sub_batch_id, batch_id) REFERENCES public.sub_batches(id, batch_id) ON DELETE RESTRICT not valid;

alter table "public"."seed_transfer_item" validate constraint "seed_transfer_item_bag_matches_batch_fkey";

alter table "public"."seed_transfer_item" add constraint "seed_transfer_item_composite_identity" UNIQUE using index "seed_transfer_item_composite_identity";

alter table "public"."seed_transfer_item" add constraint "seed_transfer_item_owner_org_id_fkey" FOREIGN KEY (owner_org_id) REFERENCES public.organisation(id) ON DELETE RESTRICT not valid;

alter table "public"."seed_transfer_item" validate constraint "seed_transfer_item_owner_org_id_fkey";

alter table "public"."seed_transfer_item" add constraint "seed_transfer_item_transfer_event_id_fkey" FOREIGN KEY (transfer_event_id) REFERENCES public.seed_transfer_event(id) ON DELETE RESTRICT not valid;

alter table "public"."seed_transfer_item" validate constraint "seed_transfer_item_transfer_event_id_fkey";

alter table "public"."seed_transfer_item" add constraint "seed_transfer_item_weight_grams_check" CHECK ((weight_grams > (0)::numeric)) not valid;

alter table "public"."seed_transfer_item" validate constraint "seed_transfer_item_weight_grams_check";

alter table "public"."storage_locations" add constraint "storage_locations_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES public.organisation(id) ON DELETE CASCADE not valid;

alter table "public"."storage_locations" validate constraint "storage_locations_organisation_id_fkey";

alter table "public"."sub_batch_lineage" add constraint "sub_batch_lineage_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."sub_batch_lineage" validate constraint "sub_batch_lineage_created_by_fkey";

alter table "public"."sub_batch_lineage" add constraint "sub_batch_lineage_derived_sub_batch_id_fkey" FOREIGN KEY (derived_sub_batch_id) REFERENCES public.sub_batches(id) ON DELETE RESTRICT not valid;

alter table "public"."sub_batch_lineage" validate constraint "sub_batch_lineage_derived_sub_batch_id_fkey";

alter table "public"."sub_batch_lineage" add constraint "sub_batch_lineage_distinct_bags" CHECK ((source_sub_batch_id <> derived_sub_batch_id)) not valid;

alter table "public"."sub_batch_lineage" validate constraint "sub_batch_lineage_distinct_bags";

alter table "public"."sub_batch_lineage" add constraint "sub_batch_lineage_source_sub_batch_id_fkey" FOREIGN KEY (source_sub_batch_id) REFERENCES public.sub_batches(id) ON DELETE RESTRICT not valid;

alter table "public"."sub_batch_lineage" validate constraint "sub_batch_lineage_source_sub_batch_id_fkey";

alter table "public"."sub_batch_lineage" add constraint "sub_batch_lineage_unique_edge" UNIQUE using index "sub_batch_lineage_unique_edge";

alter table "public"."sub_batches" add constraint "sub_batches_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE not valid;

alter table "public"."sub_batches" validate constraint "sub_batches_batch_id_fkey";

alter table "public"."sub_batches" add constraint "sub_batches_container_id_fkey" FOREIGN KEY (container_id) REFERENCES public.containers(id) ON DELETE RESTRICT not valid;

alter table "public"."sub_batches" validate constraint "sub_batches_container_id_fkey";

alter table "public"."sub_batches" add constraint "sub_batches_held_by_org_id_fkey" FOREIGN KEY (held_by_org_id) REFERENCES public.organisation(id) not valid;

alter table "public"."sub_batches" validate constraint "sub_batches_held_by_org_id_fkey";

alter table "public"."sub_batches" add constraint "sub_batches_id_batch_id_key" UNIQUE using index "sub_batches_id_batch_id_key";

alter table "public"."sub_batches" add constraint "sub_batches_weight_grams_check" CHECK ((weight_grams > (0)::numeric)) not valid;

alter table "public"."sub_batches" validate constraint "sub_batches_weight_grams_check";

alter table "public"."tests" add constraint "tests_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE not valid;

alter table "public"."tests" validate constraint "tests_batch_id_fkey";

alter table "public"."tests" add constraint "tests_performed_by_organisation_id_fkey" FOREIGN KEY (performed_by_organisation_id) REFERENCES public.organisation(id) ON DELETE SET NULL not valid;

alter table "public"."tests" validate constraint "tests_performed_by_organisation_id_fkey";

alter table "public"."tests" add constraint "tests_sub_batch_id_fkey" FOREIGN KEY (sub_batch_id) REFERENCES public.sub_batches(id) ON DELETE CASCADE not valid;

alter table "public"."tests" validate constraint "tests_sub_batch_id_fkey";

alter table "public"."tests" add constraint "tests_tested_by_fkey" FOREIGN KEY (tested_by) REFERENCES auth.users(id) not valid;

alter table "public"."tests" validate constraint "tests_tested_by_fkey";

alter table "public"."tests" add constraint "tests_type_check" CHECK ((type = ANY (ARRAY['quality'::text, 'germination'::text]))) not valid;

alter table "public"."tests" validate constraint "tests_type_check";

alter table "public"."treatments" add constraint "treatments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."treatments" validate constraint "treatments_created_by_fkey";

alter table "public"."treatments" add constraint "treatments_input_batch_id_fkey" FOREIGN KEY (input_batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT not valid;

alter table "public"."treatments" validate constraint "treatments_input_batch_id_fkey";

alter table "public"."treatments" add constraint "treatments_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES public.organisation(id) not valid;

alter table "public"."treatments" validate constraint "treatments_organisation_id_fkey";

alter table "public"."treatments" add constraint "treatments_output_batch_id_fkey" FOREIGN KEY (output_batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT not valid;

alter table "public"."treatments" validate constraint "treatments_output_batch_id_fkey";

alter table "public"."treatments" add constraint "treatments_treat_check" CHECK (public.validate_treatment_array("treat")) not valid;

alter table "public"."treatments" validate constraint "treatments_treat_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.assert_same_custodian(p_batch_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT cbc.organisation_id
  INTO v_org
  FROM current_batch_custody cbc
  JOIN unnest(p_batch_ids) b(id) ON b.id = cbc.batch_id
  GROUP BY cbc.organisation_id
  HAVING count(*) = array_length(p_batch_ids, 1);

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'All source batches must share the same current custodian organisation';
  END IF;
  RETURN v_org;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auth_org_permissions()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN jsonb_typeof((SELECT auth.jwt()) -> 'app_metadata' -> 'permissions') = 'array'
      THEN ARRAY(
        SELECT jsonb_array_elements_text(
          (SELECT auth.jwt()) -> 'app_metadata' -> 'permissions'
        )
      )
    ELSE COALESCE(
      (
        SELECT ou.permissions::text[]
        FROM public.org_user ou
        WHERE ou.user_id = (SELECT auth.uid())
          AND ou.is_active = true
        ORDER BY ou.joined_at ASC
        LIMIT 1
      ),
      '{}'::text[]
    )
  END
$function$
;

CREATE OR REPLACE FUNCTION public.auth_org_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT NULLIF(
    (SELECT auth.jwt()) -> 'app_metadata' ->> 'role',
    ''
  )
$function$
;

create or replace view "public"."batch_current_weight" as  SELECT b.id,
    b.weight_grams AS original_weight,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM public.batch_merges bm
              WHERE (bm.source_batch_id = b.id))) THEN (0)::numeric
            WHEN (NOT (EXISTS ( SELECT 1
               FROM public.sub_batches sb
              WHERE (sb.batch_id = b.id)))) THEN NULL::numeric
            ELSE COALESCE(( SELECT sum((sb.weight_grams + COALESCE(( SELECT sum(wa.weight_grams) AS sum
                       FROM public.batch_weight_adjustments wa
                      WHERE (wa.sub_batch_id = sb.id)), (0)::numeric))) AS sum
               FROM public.sub_batches sb
              WHERE ((sb.batch_id = b.id) AND (sb.held_by_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))), (0)::numeric)
        END AS current_weight
   FROM public.batches b;


CREATE OR REPLACE FUNCTION public.batch_has_externally_held_bags(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.batches b ON b.id = sb.batch_id
    WHERE sb.batch_id = p_batch_id
      AND sb.held_by_org_id IS DISTINCT FROM b.organisation_id
  )
$function$
;

create or replace view "public"."batch_lineage" as  SELECT bs.child_batch_id AS batch_id,
    bs.parent_batch_id,
    'split'::text AS creation_event,
    b.created_at,
    jsonb_build_object('batch_split_id', bs.id, 'weight_grams', b.weight_grams) AS event_details
   FROM (public.batch_splits bs
     JOIN public.batches b ON ((b.id = bs.child_batch_id)))
UNION ALL
 SELECT bm.merged_batch_id AS batch_id,
    NULL::uuid AS parent_batch_id,
    'merge'::text AS creation_event,
    b.created_at,
    jsonb_build_object('batch_merge_ids', jsonb_agg(bm.id ORDER BY bm.created_at), 'source_batch_ids', jsonb_agg(bm.source_batch_id ORDER BY bm.created_at)) AS event_details
   FROM (public.batch_merges bm
     JOIN public.batches b ON ((b.id = bm.merged_batch_id)))
  GROUP BY bm.merged_batch_id, b.created_at
UNION ALL
 SELECT bt.output_batch_id AS batch_id,
    bt.input_batch_id AS parent_batch_id,
    'treating'::text AS creation_event,
    b.created_at,
    jsonb_build_object('treatments_id', bt.id, 'treat', bt."treat", 'quality_assessment', bt.quality_assessment, 'output_weight', b.weight_grams) AS event_details
   FROM (public.treatments bt
     JOIN public.batches b ON ((b.id = bt.output_batch_id)))
UNION ALL
 SELECT bco.output_batch_id AS batch_id,
    bc.input_batch_id AS parent_batch_id,
    'cleaning'::text AS creation_event,
    b.created_at,
    jsonb_build_object('batch_cleaning_id', bc.id, 'cleaning_output_id', bco.id, 'quality', bco.quality, 'material_type', bco.material_type, 'output_weight', bco.weight_grams) AS event_details
   FROM ((public.batch_cleaning bc
     JOIN public.batch_cleaning_output bco ON ((bco.cleaning_id = bc.id)))
     JOIN public.batches b ON ((b.id = bco.output_batch_id)))
UNION ALL
 SELECT b.id AS batch_id,
    NULL::uuid AS parent_batch_id,
    'initial'::text AS creation_event,
    b.created_at,
    jsonb_build_object('collection_id', b.collection_id) AS event_details
   FROM public.batches b
  WHERE ((NOT (EXISTS ( SELECT 1
           FROM public.batch_splits bs
          WHERE (bs.child_batch_id = b.id)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.batch_merges bm
          WHERE (bm.merged_batch_id = b.id)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.treatments bt
          WHERE (bt.output_batch_id = b.id)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.batch_cleaning_output bco
          WHERE (bco.output_batch_id = b.id)))));


create or replace view "public"."batch_lineage_to_collections" as  WITH RECURSIVE lineage(batch_id, collection_id) AS (
         SELECT batches.id AS batch_id,
            batches.collection_id
           FROM public.batches
          WHERE (batches.collection_id IS NOT NULL)
        UNION ALL
         SELECT next_batch.batch_id,
            l.collection_id
           FROM (lineage l
             JOIN ( SELECT batch_splits.parent_batch_id AS source_id,
                    batch_splits.child_batch_id AS batch_id
                   FROM public.batch_splits
                UNION ALL
                 SELECT batch_merges.source_batch_id AS source_id,
                    batch_merges.merged_batch_id AS batch_id
                   FROM public.batch_merges
                UNION ALL
                 SELECT treatments.input_batch_id AS source_id,
                    treatments.output_batch_id AS batch_id
                   FROM public.treatments
                  WHERE (treatments.input_batch_id IS NOT NULL)
                UNION ALL
                 SELECT bc.input_batch_id AS source_id,
                    bco.output_batch_id AS batch_id
                   FROM (public.batch_cleaning bc
                     JOIN public.batch_cleaning_output bco ON ((bco.cleaning_id = bc.id)))
                  WHERE (bc.input_batch_id IS NOT NULL)) next_batch ON ((next_batch.source_id = l.batch_id)))
        )
 SELECT DISTINCT lineage.batch_id,
    lineage.collection_id
   FROM lineage;


CREATE OR REPLACE FUNCTION public.batch_weight_info(batch_row public.batches)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'original_weight', bcw.original_weight,
    'current_weight', bcw.current_weight
  )
  FROM batch_current_weight bcw
  WHERE bcw.id = batch_row.id;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_quality_test_statistics(p_test_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  test_result JSONB;
  batch_id UUID;
  batch_weight NUMERIC;
  repeats JSONB;
  repeat_count INTEGER;
  viability_values NUMERIC[] := ARRAY[]::NUMERIC[];
  per_seed_weights NUMERIC[] := ARRAY[]::NUMERIC[];
  repeat_item JSONB;
  viable_count NUMERIC;
  dead_count NUMERIC;
  total_count NUMERIC;
  weight_grams NUMERIC;
  psu_grams NUMERIC;
  inert_weight NUMERIC;
  other_species_weight NUMERIC;
  total_sample_weight NUMERIC;
  mean_viability NUMERIC;
  mean_seed_weight NUMERIC;
  pure_seed_fraction NUMERIC;
  pure_live_seed_fraction NUMERIC;
  batch_seed_count NUMERIC;
  batch_pure_seed_count INTEGER;
  batch_pure_live_seed_count INTEGER;
  std_dev NUMERIC;
  standard_error NUMERIC;
  result JSONB;
BEGIN
  SELECT t.result, t.batch_id INTO test_result, batch_id
  FROM tests t WHERE t.id = p_test_id;

  IF test_result IS NULL THEN RETURN NULL; END IF;

  SELECT bcw.current_weight INTO batch_weight
  FROM batch_current_weight bcw WHERE bcw.id = batch_id;

  repeats := test_result->'repeats';
  repeat_count := jsonb_array_length(repeats);

  IF repeat_count IS NULL OR repeat_count = 0 THEN RETURN NULL; END IF;

  FOR i IN 0..(repeat_count - 1) LOOP
    repeat_item := repeats->i;
    viable_count := (repeat_item->>'viable_seed_count')::NUMERIC;
    dead_count := (repeat_item->>'dead_seed_count')::NUMERIC;
    weight_grams := (repeat_item->>'weight_grams')::NUMERIC;
    total_count := viable_count + dead_count;

    IF total_count = 0 THEN
      viability_values := array_append(viability_values, 0);
      per_seed_weights := array_append(per_seed_weights, 0);
    ELSE
      viability_values := array_append(viability_values, viable_count / total_count);
      per_seed_weights := array_append(per_seed_weights, weight_grams / total_count);
    END IF;
  END LOOP;

  SELECT AVG(val) INTO mean_viability FROM unnest(viability_values) AS val;
  SELECT AVG(val) INTO mean_seed_weight FROM unnest(per_seed_weights) AS val;

  psu_grams := (test_result->>'psu_grams')::NUMERIC;
  inert_weight := COALESCE((test_result->>'inert_seed_weight_grams')::NUMERIC, 0);
  other_species_weight := COALESCE((test_result->>'other_species_seeds_grams')::NUMERIC, 0);
  total_sample_weight := psu_grams + inert_weight + other_species_weight;

  IF total_sample_weight = 0 THEN
    pure_seed_fraction := 0;
  ELSE
    pure_seed_fraction := psu_grams / total_sample_weight;
  END IF;

  pure_live_seed_fraction := pure_seed_fraction * mean_viability;

  IF batch_weight IS NOT NULL AND batch_weight > 0 AND mean_seed_weight > 0 THEN
    batch_seed_count := batch_weight / mean_seed_weight;
    batch_pure_seed_count := ROUND(batch_seed_count * pure_seed_fraction)::INTEGER;
    batch_pure_live_seed_count := ROUND(batch_seed_count * pure_live_seed_fraction)::INTEGER;
  ELSE
    batch_seed_count := NULL;
    batch_pure_seed_count := NULL;
    batch_pure_live_seed_count := NULL;
  END IF;

  std_dev := calculate_standard_deviation(viability_values);
  IF std_dev IS NOT NULL THEN
    standard_error := std_dev / SQRT(repeat_count);
  ELSE
    standard_error := NULL;
  END IF;

  result := jsonb_build_object(
    'tpsu', ROUND(mean_seed_weight::NUMERIC, 6),
    'psu', ROUND(pure_seed_fraction::NUMERIC, 6),
    'vsu', ROUND(mean_viability::NUMERIC, 6),
    'pls', ROUND(pure_live_seed_fraction::NUMERIC, 6),
    'plsCount', batch_pure_live_seed_count,
    'psuCount', batch_pure_seed_count,
    'standardError', CASE WHEN standard_error IS NOT NULL
                     THEN ROUND(standard_error::NUMERIC, 6) ELSE NULL END
  );

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_standard_deviation(input_values numeric[])
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n INTEGER;
  mean_val NUMERIC;
  sum_val NUMERIC;
  sum_squares NUMERIC;
  variance NUMERIC;
BEGIN
  n := array_length(input_values, 1);
  IF n IS NULL OR n < 2 THEN
    RETURN NULL;
  END IF;

  SELECT SUM(val), SUM(val * val)
  INTO sum_val, sum_squares
  FROM unnest(input_values) AS val;

  mean_val := sum_val / n;
  variance := (sum_squares - n * mean_val * mean_val) / (n - 1);
  RETURN SQRT(variance);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_batch(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT public.is_batch_owner(p_batch_id)
      OR public.holds_any_bag_of_batch(p_batch_id)
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_sub_batch(p_sub_batch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.org_user ou
      ON ou.organisation_id = sb.held_by_org_id
    WHERE sb.id = p_sub_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.batch_testing_assignment bta
    INNER JOIN public.org_user ou
      ON ou.organisation_id = bta.assigned_by_org_id
    WHERE bta.sub_batch_id = p_sub_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  );
END;
$function$
;

create or replace view "public"."current_batch_custody" as  SELECT DISTINCT ON (batch_custody.batch_id) batch_custody.batch_id,
    batch_custody.organisation_id,
    batch_custody.received_at
   FROM public.batch_custody
  ORDER BY batch_custody.batch_id, batch_custody.received_at DESC;


create or replace view "public"."current_batch_storage" as  SELECT DISTINCT ON (bs.sub_batch_id) bs.id,
    sb.batch_id,
    bs.sub_batch_id,
    bs.location_id,
    bs.stored_at,
    bs.notes
   FROM (public.batch_storage bs
     JOIN public.sub_batches sb ON ((sb.id = bs.sub_batch_id)))
  WHERE (bs.moved_out_at IS NULL)
  ORDER BY bs.sub_batch_id, bs.stored_at DESC;


CREATE OR REPLACE FUNCTION public.current_custodian_org_id(p_batch_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT cbc.organisation_id
  FROM current_batch_custody cbc
  WHERE cbc.batch_id = p_batch_id
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_org_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_required text := TG_ARGV[0];
BEGIN
  -- Writes made on a collection's behalf by the database itself (see
  -- fn_create_origin_batch_for_collection) opt out for the transaction.
  IF COALESCE(current_setting('nasti.bypass_permission_check', true), '') = 'on' THEN
    RETURN NULL;
  END IF;

  -- Only end-user requests carry an 'authenticated' role claim. Migrations,
  -- edge functions on the service key and psql sessions are left alone.
  IF ((SELECT auth.jwt()) ->> 'role') IS DISTINCT FROM 'authenticated' THEN
    RETURN NULL;
  END IF;

  IF NOT public.has_org_permission(v_required) THEN
    RAISE EXCEPTION
      'Your account does not have % access', v_required
      USING ERRCODE = '42501';
  END IF;

  -- Statement-level trigger: the return value is discarded.
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_assign_bags_for_testing(p_provider_org_id uuid, p_bags jsonb)
 RETURNS SETOF public.batch_testing_assignment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_caller_role public.org_user_types;
  v_bag_ids uuid[] := '{}'::uuid[];
  v_assignment_ids uuid[] := '{}'::uuid[];
  v_requests jsonb;
  v_item jsonb;
  v_raw text;
  v_bag_id uuid;
  v_assigned_bag_id uuid;
  v_batch_id uuid;
  v_holder_org_id uuid;
  v_sample_weight numeric;
  v_container_id uuid;
  v_current_weight numeric;
  v_split_ids uuid[];
  v_transfer_event_id uuid;
  v_transfer_item_id uuid;
  v_owner_org_id uuid;
  v_moved_weight numeric;
  v_assignment_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT ou.organisation_id, ou.role
    INTO v_caller_org_id, v_caller_role
  FROM public.org_user ou
  WHERE ou.user_id = v_user_id
    AND ou.is_active = true
  ORDER BY ou.joined_at ASC
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Admin role required to assign bags for testing'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------
  -- Request shape. Identifiers are cast defensively: a malformed uuid would
  -- otherwise surface to the edge wrapper as 22P02, which is outside the
  -- code contract above and maps to nothing useful.
  -- --------------------------------------------------------------------
  IF jsonb_typeof(p_bags) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_bags) = 0 THEN
    RAISE EXCEPTION 'At least one bag is required'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_bags) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Every entry must be an object describing one bag'
        USING ERRCODE = '22023';
    END IF;

    v_raw := nullif(v_item ->> 'sub_batch_id', '');

    IF v_raw IS NULL THEN
      RAISE EXCEPTION 'Every entry requires a sub_batch_id'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_bag_id := v_raw::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'sub_batch_id % is not a valid identifier', v_raw
        USING ERRCODE = '22023';
    END;

    IF v_bag_id = ANY (v_bag_ids) THEN
      RAISE EXCEPTION 'A bag may appear only once in an assignment request'
        USING ERRCODE = '22023';
    END IF;

    v_raw := nullif(v_item ->> 'sample_weight_grams', '');

    IF v_raw IS NOT NULL THEN
      BEGIN
        v_sample_weight := v_raw::numeric;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'sample_weight_grams % is not a number', v_raw
          USING ERRCODE = '22023';
      END;

      IF v_sample_weight <= 0 THEN
        RAISE EXCEPTION 'sample_weight_grams must be greater than zero'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    v_raw := nullif(v_item ->> 'container_id', '');

    IF v_raw IS NOT NULL THEN
      BEGIN
        v_container_id := v_raw::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'container_id % is not a valid identifier', v_raw
          USING ERRCODE = '22023';
      END;
    END IF;

    v_bag_ids := v_bag_ids || v_bag_id;
  END LOOP;

  -- Work in identifier order from here on, which is also the order the rows
  -- come back in.
  SELECT jsonb_agg(e ORDER BY (e ->> 'sub_batch_id')::uuid)
    INTO v_requests
  FROM jsonb_array_elements(p_bags) AS e;

  -- --------------------------------------------------------------------
  -- An accepted link is the whole permission check. The link used to carry
  -- can_test and can_process flags, but with treating gone every assignment
  -- is the same thing, so there was nothing left for them to discriminate.
  -- --------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.organisation o WHERE o.id = p_provider_org_id
  ) THEN
    RAISE EXCEPTION 'Testing provider not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation o
    WHERE o.id = p_provider_org_id
      AND o.is_testing_provider
  ) THEN
    RAISE EXCEPTION 'Bags may only be assigned to a testing provider'
      USING ERRCODE = '42501';
  END IF;

  -- A row in organisation_link is an accepted link; requests live in their own
  -- table until they are accepted. Matching on requesting_org_id is also what
  -- proves the caller is the General side of the relationship.
  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation_link ol
    WHERE ol.requesting_org_id = v_caller_org_id
      AND ol.provider_org_id = p_provider_org_id
  ) THEN
    RAISE EXCEPTION 'Your organisation is not linked to that testing provider'
      USING ERRCODE = '42501';
  END IF;

  -- --------------------------------------------------------------------
  -- Lock before checking, bags first and then their parent batches, each in
  -- identifier order. Two concurrent multi-bag requests therefore queue
  -- behind one another instead of deadlocking.
  -- --------------------------------------------------------------------
  PERFORM 1
  FROM public.sub_batches sb
  WHERE sb.id = ANY (v_bag_ids)
  ORDER BY sb.id
  FOR UPDATE;

  PERFORM 1
  FROM public.batches b
  WHERE b.id IN (
    SELECT sb.batch_id
    FROM public.sub_batches sb
    WHERE sb.id = ANY (v_bag_ids)
  )
  ORDER BY b.id
  FOR UPDATE;

  PERFORM 1
  FROM public.batch_testing_assignment bta
  WHERE bta.sub_batch_id = ANY (v_bag_ids)
    AND bta.closed_at IS NULL
  ORDER BY bta.sub_batch_id
  FOR UPDATE;

  -- --------------------------------------------------------------------
  -- Validate every bag before writing anything: the request is all or
  -- nothing, and a partially valid multi-bag request must leave no trace.
  -- --------------------------------------------------------------------
  FOR v_item IN SELECT jsonb_array_elements(v_requests) LOOP
    v_bag_id := (v_item ->> 'sub_batch_id')::uuid;
    v_sample_weight := nullif(v_item ->> 'sample_weight_grams', '')::numeric;
    v_container_id := nullif(v_item ->> 'container_id', '')::uuid;

    SELECT sb.batch_id, sb.held_by_org_id, b.organisation_id
      INTO v_batch_id, v_holder_org_id, v_owner_org_id
    FROM public.sub_batches sb
    INNER JOIN public.batches b ON b.id = sb.batch_id
    WHERE sb.id = v_bag_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bag % not found', v_bag_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Checked before the holder test on purpose. An assigned bag is held by the
    -- laboratory, so the holder test would also reject it — but with "not held
    -- by your organisation", which describes a consequence rather than the
    -- cause and invites the caller to go looking for a custody problem that
    -- does not exist. A double-send is a conflict, and says so.
    IF EXISTS (
      SELECT 1
      FROM public.batch_testing_assignment bta
      WHERE bta.sub_batch_id = v_bag_id
        AND bta.closed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Bag % already has an active testing assignment', v_bag_id
        USING ERRCODE = '55000';
    END IF;

    -- Dispatch requires both ownership and physical custody. A provider can
    -- send seed it owns, but custody alone never permits forwarding another
    -- organisation's seed to a third party.
    IF v_holder_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'Bag % is not held by your organisation', v_bag_id
        USING ERRCODE = '42501';
    END IF;

    IF v_owner_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'Bag % is not owned by your organisation', v_bag_id
        USING ERRCODE = '42501';
    END IF;

    SELECT sbcw.current_weight
      INTO v_current_weight
    FROM public.sub_batch_current_weight sbcw
    WHERE sbcw.id = v_bag_id;

    IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
      RAISE EXCEPTION 'Bag % has no seed left to send', v_bag_id
        USING ERRCODE = '22023';
    END IF;

    -- Strictly less: sending the whole bag is what omitting the sample weight
    -- means, and a split that leaves the source at zero would strand it.
    IF v_sample_weight IS NOT NULL AND v_sample_weight >= v_current_weight THEN
      RAISE EXCEPTION
        'Sample weight must be less than the current weight of bag %', v_bag_id
        USING ERRCODE = '22023';
    END IF;

    IF v_container_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.containers c
      WHERE c.id = v_container_id
        AND c.organisation_id = v_caller_org_id
        AND c.purpose = 'storage'
        AND c.active
    ) THEN
      RAISE EXCEPTION
        'Mailing container % must be an active storage container of your organisation',
        v_container_id
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- --------------------------------------------------------------------
  -- Writes
  -- --------------------------------------------------------------------
  INSERT INTO public.seed_transfer_event (
    sender_org_id,
    recipient_org_id,
    kind,
    effective_at,
    recorded_at,
    recorded_by
  ) VALUES (
    v_caller_org_id,
    p_provider_org_id,
    'testing_dispatch',
    v_now,
    v_now,
    v_user_id
  )
  RETURNING id INTO v_transfer_event_id;

  FOR v_item IN SELECT jsonb_array_elements(v_requests) LOOP
    v_bag_id := (v_item ->> 'sub_batch_id')::uuid;
    v_sample_weight := nullif(v_item ->> 'sample_weight_grams', '')::numeric;
    v_container_id := nullif(v_item ->> 'container_id', '')::uuid;

    SELECT sb.batch_id
      INTO v_batch_id
    FROM public.sub_batches sb
    WHERE sb.id = v_bag_id;

    IF v_sample_weight IS NOT NULL THEN
      -- The child is created under the same parent batch and, because the
      -- caller holds the source, held by the caller — so the transfer below
      -- reads the same either way.
      v_split_ids := public.fn_split_sub_batch(
        v_bag_id,
        jsonb_build_array(
          jsonb_build_object(
            'weight_grams', v_sample_weight,
            'container_id', v_container_id,
            'notes', 'Sample sent for testing'
          )
        )
      );

      v_assigned_bag_id := v_split_ids[1];
    ELSE
      v_assigned_bag_id := v_bag_id;

      IF v_container_id IS NOT NULL THEN
        UPDATE public.sub_batches
        SET container_id = v_container_id
        WHERE id = v_assigned_bag_id;
      END IF;
    END IF;

    SELECT b.organisation_id, sbcw.current_weight
      INTO v_owner_org_id, v_moved_weight
    FROM public.sub_batches sb
    INNER JOIN public.batches b ON b.id = sb.batch_id
    INNER JOIN public.sub_batch_current_weight sbcw ON sbcw.id = sb.id
    WHERE sb.id = v_assigned_bag_id;

    INSERT INTO public.seed_transfer_item (
      transfer_event_id,
      sub_batch_id,
      batch_id,
      owner_org_id,
      weight_grams
    ) VALUES (
      v_transfer_event_id,
      v_assigned_bag_id,
      v_batch_id,
      v_owner_org_id,
      v_moved_weight
    )
    RETURNING id INTO v_transfer_item_id;

    -- An assigned bag is in the mail, not on a shelf. Close its storage row
    -- while the caller still holds it — fn_set_sub_batch_storage is gated on
    -- the bag's holder, and the next statement hands the bag over.
    IF EXISTS (
      SELECT 1
      FROM public.batch_storage bs
      WHERE bs.sub_batch_id = v_assigned_bag_id
        AND bs.moved_out_at IS NULL
    ) THEN
      PERFORM public.fn_set_sub_batch_storage(
        v_assigned_bag_id,
        NULL::uuid,
        v_now,
        'Removed from storage: assigned for testing'
      );
    END IF;

    UPDATE public.sub_batches
    SET held_by_org_id = p_provider_org_id
    WHERE id = v_assigned_bag_id;

    INSERT INTO public.batch_testing_assignment (
      batch_id,
      sub_batch_id,
      assigned_to_org_id,
      assigned_by_org_id,
      assigned_at,
      outbound_transfer_item_id
    ) VALUES (
      v_batch_id,
      v_assigned_bag_id,
      p_provider_org_id,
      v_caller_org_id,
      v_now,
      v_transfer_item_id
    )
    RETURNING id INTO v_assignment_id;

    v_assignment_ids := v_assignment_ids || v_assignment_id;
  END LOOP;

  RETURN QUERY
  SELECT bta.*
  FROM public.batch_testing_assignment bta
  WHERE bta.id = ANY (v_assignment_ids)
  ORDER BY bta.sub_batch_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_bag_and_store_cleaning_outputs(p_cleaning_id uuid, p_bags jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_created_ids UUID[];
  v_initial_bag_ids UUID[];
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(bag.id), '{}'::UUID[])
  INTO v_initial_bag_ids
  FROM public.batch_cleaning_output output
  INNER JOIN public.sub_batches bag ON bag.batch_id = output.output_batch_id
  WHERE output.cleaning_id = p_cleaning_id;

  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = ANY (v_initial_bag_ids);

  v_created_ids :=
    public.fn_bag_cleaning_outputs_unclassified(
      p_cleaning_id,
      p_bags
    );

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'cleaning',
    lineage_operation_id = p_cleaning_id
  WHERE adjustment.sub_batch_id = ANY (v_initial_bag_ids)
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != cardinality(v_initial_bag_ids) THEN
    RAISE EXCEPTION 'Bagging must replace each aggregate with one adjustment';
  END IF;

  RETURN v_created_ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_bag_cleaning_outputs_unclassified(p_cleaning_id uuid, p_bags jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_organisation_id UUID;
  v_input_sub_batch_id UUID;
  v_output_count INTEGER;
  v_entry_count INTEGER;
  v_existing_sub_batch_count INTEGER;
  v_initial_sub_batch_id UUID;
  v_lineage_source_sub_batch_id UUID;
  v_allocated_weight NUMERIC;
  v_output RECORD;
  v_output_entry JSONB;
  v_container_group JSONB;
  v_container_id UUID;
  v_location_id UUID;
  v_quantity INTEGER;
  v_weight_grams NUMERIC;
  v_sub_batch_id UUID;
  v_container_index INTEGER;
  v_created_ids UUID[] := '{}'::UUID[];
BEGIN
  IF jsonb_typeof(p_bags) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Bagging entries must be an array';
  END IF;

  SELECT bc.organisation_id, bc.input_sub_batch_id
  INTO v_organisation_id, v_input_sub_batch_id
  FROM public.batch_cleaning bc
  WHERE bc.id = p_cleaning_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cleaning record not found';
  END IF;

  IF v_organisation_id IS DISTINCT FROM public.get_user_organisation_id() THEN
    RAISE EXCEPTION 'Permission denied: cleaning record belongs to another organisation';
  END IF;

  SELECT count(*)
  INTO v_output_count
  FROM public.batch_cleaning_output
  WHERE cleaning_id = p_cleaning_id;

  IF jsonb_array_length(p_bags) != v_output_count THEN
    RAISE EXCEPTION 'Bagging details are required for every cleaning output';
  END IF;

  FOR v_output IN
    SELECT output_batch_id, weight_grams, quality
    FROM public.batch_cleaning_output
    WHERE cleaning_id = p_cleaning_id
    ORDER BY quality
  LOOP
    IF NOT public.is_current_custodian(auth.uid(), v_output.output_batch_id) THEN
      RAISE EXCEPTION
        'Permission denied: user is not the current custodian of output batch %',
        v_output.output_batch_id;
    END IF;

    SELECT count(*), min(entry.value::TEXT)::JSONB
    INTO v_entry_count, v_output_entry
    FROM jsonb_array_elements(p_bags) entry
    WHERE entry.value->>'output_batch_id' = v_output.output_batch_id::TEXT;

    IF v_entry_count != 1 THEN
      RAISE EXCEPTION 'Exactly one bagging entry is required for output batch %',
        v_output.output_batch_id;
    END IF;

    IF jsonb_typeof(v_output_entry->'containers') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_output_entry->'containers') = 0 THEN
      RAISE EXCEPTION 'At least one container group is required for output batch %',
        v_output.output_batch_id;
    END IF;

    SELECT COALESCE(sum(
      (container_group.value->>'quantity')::INTEGER
      * (container_group.value->>'weight_grams')::NUMERIC
    ), 0)
    INTO v_allocated_weight
    FROM jsonb_array_elements(v_output_entry->'containers') container_group;

    IF v_allocated_weight != v_output.weight_grams THEN
      RAISE EXCEPTION
        'Container weights for output batch % total % g, expected % g',
        v_output.output_batch_id,
        v_allocated_weight,
        v_output.weight_grams;
    END IF;

    SELECT id
    INTO v_initial_sub_batch_id
    FROM public.sub_batches
    WHERE batch_id = v_output.output_batch_id
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Output batch % is no longer in its initial bagging state',
        v_output.output_batch_id;
    END IF;

    SELECT count(*)
    INTO v_existing_sub_batch_count
    FROM public.sub_batches
    WHERE batch_id = v_output.output_batch_id;

    IF v_existing_sub_batch_count != 1 THEN
      RAISE EXCEPTION
        'Output batch % is no longer in its initial bagging state',
        v_output.output_batch_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.sub_batches sb
      WHERE sb.id = v_initial_sub_batch_id
        AND sb.container_id IS NULL
        AND sb.weight_grams = v_output.weight_grams
    ) THEN
      RAISE EXCEPTION
        'Output batch % is no longer in its initial bagging state',
        v_output.output_batch_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.batch_storage bs
      WHERE bs.sub_batch_id = v_initial_sub_batch_id
    ) OR EXISTS (
      SELECT 1
      FROM public.batch_weight_adjustments bwa
      WHERE bwa.sub_batch_id = v_initial_sub_batch_id
    ) OR EXISTS (
      SELECT 1
      FROM public.tests test
      WHERE test.sub_batch_id = v_initial_sub_batch_id
    ) THEN
      RAISE EXCEPTION
        'Output batch % has already been stored, adjusted, or tested',
        v_output.output_batch_id;
    END IF;

    FOR v_container_group IN
      SELECT value
      FROM jsonb_array_elements(v_output_entry->'containers')
    LOOP
      v_container_id := (v_container_group->>'container_id')::UUID;
      v_location_id := NULLIF(v_container_group->>'location_id', '')::UUID;
      v_quantity := (v_container_group->>'quantity')::INTEGER;
      v_weight_grams := (v_container_group->>'weight_grams')::NUMERIC;

      IF v_quantity <= 0 OR v_weight_grams <= 0 THEN
        RAISE EXCEPTION 'Container quantity and weight must be greater than zero';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.containers container
        WHERE container.id = v_container_id
          AND container.organisation_id = v_organisation_id
          AND container.purpose = 'storage'
          AND container.active
      ) THEN
        RAISE EXCEPTION 'Invalid or inactive storage container %', v_container_id;
      END IF;

      IF v_location_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.storage_locations location
        WHERE location.id = v_location_id
          AND location.organisation_id = v_organisation_id
      ) THEN
        RAISE EXCEPTION 'Invalid storage location %', v_location_id;
      END IF;
    END LOOP;

    v_lineage_source_sub_batch_id := COALESCE(
      v_input_sub_batch_id,
      v_initial_sub_batch_id
    );

    INSERT INTO public.batch_weight_adjustments (
      sub_batch_id,
      weight_grams,
      reason,
      created_by
    ) VALUES (
      v_initial_sub_batch_id,
      -v_output.weight_grams,
      'Replaced by physical cleaning-output bags',
      auth.uid()
    );

    FOR v_container_group IN
      SELECT value
      FROM jsonb_array_elements(v_output_entry->'containers')
    LOOP
      v_container_id := (v_container_group->>'container_id')::UUID;
      v_location_id := NULLIF(v_container_group->>'location_id', '')::UUID;
      v_quantity := (v_container_group->>'quantity')::INTEGER;
      v_weight_grams := (v_container_group->>'weight_grams')::NUMERIC;

      FOR v_container_index IN 1..v_quantity
      LOOP
        INSERT INTO public.sub_batches (
          batch_id,
          container_id,
          weight_grams,
          notes
        ) VALUES (
          v_output.output_batch_id,
          v_container_id,
          v_weight_grams,
          'Bagged after cleaning'
        )
        RETURNING id INTO v_sub_batch_id;

        INSERT INTO public.sub_batch_lineage (
          source_sub_batch_id,
          derived_sub_batch_id,
          operation_kind,
          operation_id,
          created_by
        ) VALUES (
          v_lineage_source_sub_batch_id,
          v_sub_batch_id,
          'cleaning',
          p_cleaning_id,
          auth.uid()
        );

        IF v_location_id IS NOT NULL THEN
          INSERT INTO public.batch_storage (
            batch_id,
            sub_batch_id,
            location_id,
            notes
          ) VALUES (
            v_output.output_batch_id,
            v_sub_batch_id,
            v_location_id,
            'Initial storage after cleaning'
          );
        END IF;

        v_created_ids := array_append(v_created_ids, v_sub_batch_id);
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_created_ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_clean_batch(p_input_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_output_batch_id UUID;
  v_collection_id UUID;
  v_collection_code TEXT;
  v_organisation_id UUID;
  v_sub_batch_count INTEGER;
  v_output JSONB;
  v_quality TEXT;
  v_out_material_type TEXT;
  v_out_weight NUMERIC;
  v_increment INTEGER;
  v_batch_code TEXT;
  v_org_count INTEGER;
BEGIN
  IF p_is_cleaned AND p_duration IS NULL THEN
    RAISE EXCEPTION 'Cleaning duration is required';
  END IF;

  SELECT b.collection_id, b.organisation_id
  INTO v_collection_id, v_organisation_id
  FROM batches b
  WHERE b.id = p_input_batch_id;

  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Input batch not found or has no collection';
  END IF;

  IF NOT is_current_custodian(auth.uid(), p_input_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  SELECT COUNT(*) INTO v_sub_batch_count
  FROM sub_batches WHERE batch_id = p_input_batch_id;

  IF v_sub_batch_count > 0 THEN
    RAISE EXCEPTION 'Cannot clean a batch that already has sub-batches. Use fn_clean_sub_batch instead.';
  END IF;

  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  IF NOT p_is_cleaned THEN
    SELECT COUNT(*)
    INTO v_org_count
    FROM jsonb_array_elements(p_outputs) AS o
    WHERE o->>'quality' != 'ORG';

    IF v_org_count > 0 THEN
      RAISE EXCEPTION 'When not cleaned, only ORG quality output is allowed';
    END IF;
  END IF;

  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = v_collection_id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  INSERT INTO batch_cleaning (
    input_batch_id, material_type, material_subtype,
    material_notes, is_cleaned, cleaning_notes,
    worker_ids, duration, created_by, organisation_id
  ) VALUES (
    p_input_batch_id, p_material_type, p_material_subtype,
    p_material_notes, p_is_cleaned, p_cleaning_notes,
    COALESCE(p_worker_ids, '{}'::UUID[]), p_duration,
    auth.uid(), v_organisation_id
  )
  RETURNING id INTO v_cleaning_id;

  FOR v_output IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_quality := v_output->>'quality';
    v_out_material_type := v_output->>'material_type';
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;

    SELECT COALESCE(MAX(
      CASE
        WHEN code ~ ('^' || v_collection_code || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE collection_id = v_collection_id;

    v_batch_code := v_collection_code || '-' || v_quality || '-' || v_increment::TEXT;

    INSERT INTO batches (
      collection_id, code, weight_grams, organisation_id
    ) VALUES (
      v_collection_id, v_batch_code, v_out_weight, v_organisation_id
    )
    RETURNING id INTO v_output_batch_id;

    INSERT INTO batch_custody (batch_id, organisation_id, notes)
    VALUES (v_output_batch_id, v_organisation_id, 'Batch created via cleaning');

    INSERT INTO batch_cleaning_output (
      cleaning_id, output_batch_id, quality, material_type, weight_grams
    ) VALUES (
      v_cleaning_id, v_output_batch_id, v_quality, v_out_material_type, v_out_weight
    );

    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_output_batch_id, v_out_weight, 'Initial sub-batch from cleaning');
  END LOOP;

  RETURN v_cleaning_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_clean_sub_batch(p_sub_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = p_sub_batch_id;

  v_cleaning_id := public.fn_clean_sub_batch_without_lineage(
    p_sub_batch_id,
    p_duration,
    p_material_type,
    p_material_subtype,
    p_material_notes,
    p_is_cleaned,
    p_cleaning_notes,
    p_worker_ids,
    p_outputs
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    p_sub_batch_id,
    output_bag.id,
    'cleaning',
    v_cleaning_id,
    auth.uid()
  FROM public.batch_cleaning_output output
  INNER JOIN public.sub_batches output_bag
    ON output_bag.batch_id = output.output_batch_id
  WHERE output.cleaning_id = v_cleaning_id;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'cleaning',
    lineage_operation_id = v_cleaning_id
  WHERE adjustment.sub_batch_id = p_sub_batch_id
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != 1 THEN
    RAISE EXCEPTION 'Sub-batch cleaning must create one source adjustment';
  END IF;

  RETURN v_cleaning_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_clean_sub_batch_without_lineage(p_sub_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_output_batch_id UUID;
  v_batch_id UUID;
  v_collection_id UUID;
  v_collection_code TEXT;
  v_organisation_id UUID;
  v_sub_batch_weight NUMERIC;
  v_effective_weight NUMERIC;
  v_output JSONB;
  v_quality TEXT;
  v_out_material_type TEXT;
  v_out_weight NUMERIC;
  v_increment INTEGER;
  v_batch_code TEXT;
  v_org_count INTEGER;
BEGIN
  IF p_is_cleaned AND p_duration IS NULL THEN
    RAISE EXCEPTION 'Cleaning duration is required';
  END IF;

  SELECT sb.batch_id, sb.weight_grams, b.collection_id, b.organisation_id
  INTO v_batch_id, v_sub_batch_weight, v_collection_id, v_organisation_id
  FROM sub_batches sb
  JOIN batches b ON b.id = sb.batch_id
  WHERE sb.id = p_sub_batch_id;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Cleaning consumes the bag entirely, so the gate is bag custody, not batch
  -- ownership: the owner of the parent batch has no business cleaning a bag
  -- that is currently in someone else's hands.
  IF NOT is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  -- Reject rather than resolve. An open assignment is a physical fact about
  -- seed a Testing organisation is holding; consuming the bag would leave that
  -- assignment pointing at material that no longer exists. The software must
  -- not close it unilaterally, and must not move it to a successor bag.
  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    WHERE bta.sub_batch_id = p_sub_batch_id
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot clean a bag with an active testing assignment';
  END IF;

  v_effective_weight := v_sub_batch_weight + COALESCE(
    (SELECT SUM(wa.weight_grams)
     FROM batch_weight_adjustments wa
     WHERE wa.sub_batch_id = p_sub_batch_id),
    0
  );

  IF v_effective_weight <= 0 THEN
    RAISE EXCEPTION 'Sub-batch has no weight remaining';
  END IF;

  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  IF NOT p_is_cleaned THEN
    SELECT COUNT(*)
    INTO v_org_count
    FROM jsonb_array_elements(p_outputs) AS o
    WHERE o->>'quality' != 'ORG';

    IF v_org_count > 0 THEN
      RAISE EXCEPTION 'When not cleaned, only ORG quality output is allowed';
    END IF;
  END IF;

  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Parent batch has no collection';
  END IF;

  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = v_collection_id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  INSERT INTO batch_cleaning (
    input_batch_id, input_sub_batch_id, material_type, material_subtype,
    material_notes, is_cleaned, cleaning_notes,
    worker_ids, duration, created_by, organisation_id
  ) VALUES (
    v_batch_id, p_sub_batch_id, p_material_type, p_material_subtype,
    p_material_notes, p_is_cleaned, p_cleaning_notes,
    COALESCE(p_worker_ids, '{}'::UUID[]), p_duration,
    auth.uid(), v_organisation_id
  )
  RETURNING id INTO v_cleaning_id;

  FOR v_output IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_quality := v_output->>'quality';
    v_out_material_type := v_output->>'material_type';
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;

    SELECT COALESCE(MAX(
      CASE
        WHEN code ~ ('^' || v_collection_code || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE collection_id = v_collection_id;

    v_batch_code := v_collection_code || '-' || v_quality || '-' || v_increment::TEXT;

    INSERT INTO batches (
      collection_id, code, weight_grams, organisation_id
    ) VALUES (
      v_collection_id, v_batch_code, v_out_weight, v_organisation_id
    )
    RETURNING id INTO v_output_batch_id;

    INSERT INTO batch_custody (batch_id, organisation_id, notes)
    VALUES (
      v_output_batch_id,
      v_organisation_id,
      'Batch created via sub-batch cleaning'
    );

    INSERT INTO batch_cleaning_output (
      cleaning_id, output_batch_id, quality, material_type, weight_grams
    ) VALUES (
      v_cleaning_id, v_output_batch_id, v_quality, v_out_material_type, v_out_weight
    );

    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_output_batch_id, v_out_weight, 'Initial sub-batch from cleaning');
  END LOOP;

  INSERT INTO batch_weight_adjustments (
    sub_batch_id, weight_grams, reason, created_by
  ) VALUES (
    p_sub_batch_id,
    -v_effective_weight,
    'Sub-batch cleaned. Fully consumed.',
    auth.uid()
  );

  RETURN v_cleaning_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_create_origin_batch_for_collection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_collection_code text;
  v_new_batch_id uuid;
BEGIN
  SELECT code INTO v_collection_code
  FROM public.collection
  WHERE id = NEW.id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  PERFORM set_config('nasti.bypass_permission_check', 'on', true);

  -- Origin batch code is the same as the collection code
  INSERT INTO public.batches (code, collection_id, organisation_id)
  VALUES (v_collection_code, NEW.id, NEW.organisation_id)
  RETURNING id INTO v_new_batch_id;

  INSERT INTO public.batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_batch_id, NEW.organisation_id, 'Batch created from collection');

  PERFORM set_config('nasti.bypass_permission_check', 'off', true);

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_create_quality_test(p_batch_id uuid, p_sub_batch_id uuid, p_result jsonb, p_performed_by_organisation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_test_id UUID;
  v_user_id UUID := (SELECT auth.uid());
  v_current_weight NUMERIC;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  v_test_id := public.fn_create_quality_test_without_work_completion(
    p_batch_id,
    p_sub_batch_id,
    p_result,
    p_performed_by_organisation_id
  );

  SELECT weight.current_weight
    INTO v_current_weight
  FROM public.sub_batch_current_weight weight
  WHERE weight.id = p_sub_batch_id;

  IF v_current_weight = 0 THEN
    -- The underlying mutation already locks the directly assigned bag. Lock
    -- every represented assignment in UUID order as well so derived or merged
    -- lineage cannot introduce a conflicting lock order later.
    PERFORM 1
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
    ORDER BY assignment.id
    FOR UPDATE;

    INSERT INTO public.batch_testing_assignment_status_audit (
      assignment_id,
      old_work_status,
      new_work_status,
      note,
      actor_id,
      recorded_at
    )
    SELECT
      assignment.id,
      assignment.work_status,
      'completed',
      NULL,
      v_user_id,
      v_now
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
      AND assignment.work_closed_at IS NULL
    ORDER BY assignment.id;

    UPDATE public.batch_testing_assignment assignment
    SET work_closed_at = v_now,
        work_status = 'completed',
        work_status_note = NULL,
        work_closed_by = v_user_id
    WHERE assignment.id IN (
      SELECT resolved.assignment_id
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        p_sub_batch_id
      ) resolved
    )
      AND assignment.work_closed_at IS NULL;
  END IF;

  RETURN v_test_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_create_quality_test_without_adjustment_classification(p_batch_id uuid, p_sub_batch_id uuid, p_result jsonb, p_performed_by_organisation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_test_id UUID;
  v_total_weight NUMERIC := 0;
  v_current_weight NUMERIC;
  v_repeat JSONB;
  v_sub_batch_batch_id UUID;
  v_user_organisation_id UUID;
  v_user_id UUID := (SELECT auth.uid());
  v_assignment_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT ou.organisation_id INTO v_user_organisation_id
  FROM public.org_user ou
  WHERE ou.user_id = v_user_id
    AND ou.is_active = true
  ORDER BY ou.joined_at ASC
  LIMIT 1;

  IF v_user_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF p_performed_by_organisation_id IS DISTINCT FROM v_user_organisation_id THEN
    RAISE EXCEPTION 'Test organisation does not match authenticated user'
      USING ERRCODE = '42501';
  END IF;

  -- Validate sub-batch belongs to the batch
  SELECT sb.batch_id INTO v_sub_batch_batch_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id;

  IF v_sub_batch_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_sub_batch_batch_id != p_batch_id THEN
    RAISE EXCEPTION 'Sub-batch does not belong to the specified batch'
      USING ERRCODE = '22023';
  END IF;

  -- One predicate covers both testers: a General organisation testing a bag it
  -- still holds, and a Testing organisation testing one that was sent to it.
  -- The batch-wide check this replaces let either of them test a sibling bag
  -- that had never left the other's shelf.
  IF NOT public.is_current_bag_custodian(v_user_id, p_sub_batch_id) THEN
    RAISE EXCEPTION 'Not authorised to test this bag'
      USING ERRCODE = '42501';
  END IF;

  -- Calculate total weight consumed from repeats
  FOR v_repeat IN SELECT * FROM jsonb_array_elements(p_result -> 'repeats')
  LOOP
    v_total_weight := v_total_weight + COALESCE((v_repeat ->> 'weight_grams')::NUMERIC, 0);
  END LOOP;

  SELECT sbcw.current_weight
    INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  -- A test cannot consume seed that is not there. There is no way to reverse a
  -- weight adjustment, so a negative bag would need a hand-written
  -- compensating row to correct.
  IF v_total_weight > COALESCE(v_current_weight, 0) THEN
    RAISE EXCEPTION
      'Test consumes %g but the bag holds %g',
      v_total_weight, COALESCE(v_current_weight, 0)
      USING ERRCODE = '22023';
  END IF;

  -- Take the assignment's lock before the first write so a concurrent return
  -- cannot close it between the test landing and completion being recorded.
  -- At most one row can match: the partial unique index says so.
  SELECT bta.id
    INTO v_assignment_id
  FROM public.batch_testing_assignment bta
  WHERE bta.sub_batch_id = p_sub_batch_id
    AND bta.closed_at IS NULL
  FOR UPDATE;

  INSERT INTO public.tests (
    batch_id, sub_batch_id, type, result,
    tested_at, tested_by,
    performed_by_organisation_id
  ) VALUES (
    p_batch_id, p_sub_batch_id, 'quality', p_result,
    now(), v_user_id,
    p_performed_by_organisation_id
  )
  RETURNING id INTO v_test_id;

  -- Create weight adjustment for seeds consumed in testing
  IF v_total_weight > 0 THEN
    INSERT INTO public.batch_weight_adjustments (
      sub_batch_id, weight_grams, reason, created_by
    ) VALUES (
      p_sub_batch_id,
      -v_total_weight,
      'Seeds consumed in quality test (test_id: ' || v_test_id || ')',
      v_user_id
    );
  END IF;

  -- The first test completes this bag's assignment; later tests change
  -- nothing. Consuming the last of the bag closes it outright: there is
  -- nothing left to send back, and an assignment left open would sit in the
  -- Testing organisation's outstanding list forever while active_sub_batches
  -- has already dropped the bag.
  IF v_assignment_id IS NOT NULL THEN
    UPDATE public.batch_testing_assignment bta
    SET completed_at = COALESCE(bta.completed_at, v_now),
        closed_at = CASE
          WHEN v_total_weight > 0 AND v_current_weight - v_total_weight = 0
            THEN v_now
          ELSE bta.closed_at
        END,
        outcome = CASE
          WHEN v_total_weight > 0 AND v_current_weight - v_total_weight = 0
            THEN 'consumed'
          ELSE bta.outcome
        END
    WHERE bta.id = v_assignment_id;
  END IF;

  RETURN v_test_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_create_quality_test_without_work_completion(p_batch_id uuid, p_sub_batch_id uuid, p_result jsonb, p_performed_by_organisation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_test_id UUID;
  v_prior_adjustment_ids UUID[];
  v_total_weight NUMERIC := 0;
  v_repeat JSONB;
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = p_sub_batch_id;

  FOR v_repeat IN SELECT * FROM jsonb_array_elements(p_result -> 'repeats')
  LOOP
    v_total_weight := v_total_weight
      + COALESCE((v_repeat ->> 'weight_grams')::NUMERIC, 0);
  END LOOP;

  v_test_id :=
    public.fn_create_quality_test_without_adjustment_classification(
      p_batch_id,
      p_sub_batch_id,
      p_result,
      p_performed_by_organisation_id
    );

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'test_consumption',
    test_id = v_test_id
  WHERE adjustment.sub_batch_id = p_sub_batch_id
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != (
    CASE WHEN v_total_weight > 0 THEN 1 ELSE 0 END
  ) THEN
    RAISE EXCEPTION 'Quality test adjustment count does not match consumption';
  END IF;

  RETURN v_test_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_default_sub_batch_holder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.held_by_org_id IS NULL THEN
    SELECT b.organisation_id
    INTO NEW.held_by_org_id
    FROM public.batches b
    WHERE b.id = NEW.batch_id;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_get_container_usage()
 RETURNS TABLE(container_id uuid, collection_count bigint, storage_sub_batch_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    container.id AS container_id,
    count(DISTINCT collection_container.collection_id) AS collection_count,
    count(DISTINCT sub_batch.id) AS storage_sub_batch_count
  FROM public.containers container
  LEFT JOIN public.collection_containers collection_container
    ON collection_container.container_id = container.id
  LEFT JOIN public.sub_batches sub_batch
    ON sub_batch.container_id = container.id
  WHERE container.organisation_id = public.get_user_organisation_id()
  GROUP BY container.id;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_merge_batches(p_source_batch_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_batch_code text;
  v_new_id uuid;
  v_same bool;
  v_total_weight numeric;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to merge';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- A whole-batch merge zeroes every source batch, so it has to answer for
  -- every bag in them. Reject rather than resolve: a bag held by another
  -- organisation is physically elsewhere, and an open assignment is a
  -- commitment about seed in someone else's hands. Neither may be consumed
  -- here, and an assignment must never be auto-closed or moved to the merged
  -- batch — if a future workflow needs that, it must do it in this same
  -- transaction and never leave an assignment pointing at deleted material.
  IF EXISTS (
    SELECT 1
    FROM sub_batches sb
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND sb.held_by_org_id IS DISTINCT FROM v_org
  ) THEN
    RAISE EXCEPTION 'Cannot merge a batch whose bags are held by another organisation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    JOIN sub_batches sb ON sb.id = bta.sub_batch_id
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot merge a batch with an active testing assignment';
  END IF;

  -- Validate that all batches share the same collection_id
  SELECT COUNT(DISTINCT collection_id) = 1
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All batches must be derived from the same collection';
  END IF;

  -- Validate that all batches have the same code
  SELECT COUNT(DISTINCT code) = 1
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All batches must have the same code to be merged';
  END IF;

  -- Get collection_id and code for the new batch
  SELECT DISTINCT collection_id, code
  INTO v_collection, v_batch_code
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  -- Validate all source batches are active and get their current weights
  SELECT
      SUM(bcw.current_weight),
      bool_and(bcw.current_weight > 0)
  INTO
      v_total_weight,
      v_same
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All source batches must be active (current weight > 0)';
  END IF;

  INSERT INTO batches (
    id,
    collection_id,
    code,
    organisation_id,
    weight_grams,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_batch_code,  -- Use shared code from source batches
    v_org,
    v_total_weight,
    p_notes
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on merge');

  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_merge_sub_batches(p_sub_batch_ids uuid[], p_container_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_destination_id UUID;
  v_operation_id UUID;
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = ANY (p_sub_batch_ids);

  v_destination_id :=
    public.fn_merge_sub_batches_without_adjustment_classification(
      p_sub_batch_ids,
      p_container_id,
      p_location_id,
      p_notes
    );

  SELECT lineage.operation_id
  INTO STRICT v_operation_id
  FROM public.sub_batch_lineage lineage
  WHERE lineage.derived_sub_batch_id = v_destination_id
    AND lineage.operation_kind = 'merge'
  LIMIT 1;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'merge',
    lineage_operation_id = v_operation_id
  WHERE adjustment.sub_batch_id = ANY (p_sub_batch_ids)
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'Merge must create one weight adjustment per source bag';
  END IF;

  RETURN v_destination_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_merge_sub_batches_without_adjustment_classification(p_sub_batch_ids uuid[], p_container_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_batch_count INTEGER;
  v_holder_count INTEGER;
  v_held_by_org_id UUID;
  v_source_count INTEGER;
  v_organisation_id UUID;
  v_total_weight NUMERIC;
  v_new_sub_batch_id UUID := gen_random_uuid();
  v_operation_id UUID := gen_random_uuid();
  v_merged_at TIMESTAMPTZ := now();
BEGIN
  IF p_sub_batch_ids IS NULL
    OR cardinality(p_sub_batch_ids) < 2 THEN
    RAISE EXCEPTION 'Provide at least two sub-batches to merge';
  END IF;

  IF (
    SELECT count(DISTINCT source_id)
    FROM unnest(p_sub_batch_ids) source_id
  ) != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'Sub-batches to merge must be distinct';
  END IF;

  IF p_container_id IS NULL THEN
    RAISE EXCEPTION 'A destination storage container is required';
  END IF;

  PERFORM sb.id
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids)
  ORDER BY sb.id
  FOR UPDATE;

  GET DIAGNOSTICS v_source_count = ROW_COUNT;

  IF v_source_count != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'One or more sub-batches were not found';
  END IF;

  SELECT count(DISTINCT sb.batch_id)
  INTO v_batch_count
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids);

  IF v_batch_count != 1 THEN
    RAISE EXCEPTION 'All sub-batches must belong to the same batch';
  END IF;

  SELECT count(DISTINCT sb.held_by_org_id)
  INTO v_holder_count
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids);

  IF v_holder_count != 1 THEN
    RAISE EXCEPTION 'All sub-batches must be held by the same organisation';
  END IF;

  SELECT sb.batch_id, sb.held_by_org_id
  INTO v_batch_id, v_held_by_org_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_ids[1];

  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_ids[1]) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of these bags';
  END IF;

  v_organisation_id := public.get_user_organisation_id();

  IF NOT EXISTS (
    SELECT 1
    FROM public.containers container
    WHERE container.id = p_container_id
      AND container.organisation_id = v_organisation_id
      AND container.purpose = 'storage'
      AND container.active
  ) THEN
    RAISE EXCEPTION
      'Invalid or inactive storage container %',
      p_container_id;
  END IF;

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.storage_locations location
    WHERE location.id = p_location_id
      AND location.organisation_id = v_organisation_id
  ) THEN
    RAISE EXCEPTION 'Invalid storage location %', p_location_id;
  END IF;

  SELECT sum(sbcw.current_weight)
  INTO v_total_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = ANY (p_sub_batch_ids);

  IF EXISTS (
    SELECT 1
    FROM public.sub_batch_current_weight sbcw
    WHERE sbcw.id = ANY (p_sub_batch_ids)
      AND sbcw.current_weight <= 0
  ) THEN
    RAISE EXCEPTION 'Every source sub-batch must have a positive current weight';
  END IF;

  INSERT INTO public.sub_batches (
    id,
    batch_id,
    container_id,
    weight_grams,
    notes,
    held_by_org_id
  ) VALUES (
    v_new_sub_batch_id,
    v_batch_id,
    p_container_id,
    v_total_weight,
    NULLIF(btrim(p_notes), ''),
    v_held_by_org_id
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    source_id,
    v_new_sub_batch_id,
    'merge',
    v_operation_id,
    auth.uid()
  FROM unnest(p_sub_batch_ids) source_id;

  INSERT INTO public.batch_weight_adjustments (
    sub_batch_id,
    weight_grams,
    reason,
    created_by
  )
  SELECT
    sbcw.id,
    -sbcw.current_weight,
    format('Merged into sub-batch %s', v_new_sub_batch_id),
    auth.uid()
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = ANY (p_sub_batch_ids);

  UPDATE public.batch_storage
  SET moved_out_at = v_merged_at
  WHERE sub_batch_id = ANY (p_sub_batch_ids)
    AND moved_out_at IS NULL;

  IF p_location_id IS NOT NULL THEN
    INSERT INTO public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id,
      stored_at,
      notes
    ) VALUES (
      v_batch_id,
      v_new_sub_batch_id,
      p_location_id,
      v_merged_at,
      'Storage after sub-batch merge'
    );
  END IF;

  RETURN v_new_sub_batch_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mix_batches(p_source_batch_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_org UUID;
  v_new_id UUID;
  v_total_weight NUMERIC;
  v_species_count INTEGER;
  v_ibra_count INTEGER;
  v_species_id UUID;
  v_oldest_date TIMESTAMPTZ;
  v_all_active BOOLEAN;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to mix';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- Mixing zeroes every source batch, so it has to answer for every bag in
  -- them. Reject rather than resolve: a bag held by another organisation is
  -- physically elsewhere, and an open assignment is a commitment about seed in
  -- someone else's hands. Neither may be consumed here, and an assignment must
  -- never be auto-closed or moved to the mixed batch.
  IF EXISTS (
    SELECT 1
    FROM sub_batches sb
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND sb.held_by_org_id IS DISTINCT FROM v_org
  ) THEN
    RAISE EXCEPTION 'Cannot mix a batch whose bags are held by another organisation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    JOIN sub_batches sb ON sb.id = bta.sub_batch_id
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot mix a batch with an active testing assignment';
  END IF;

  -- Validate all batches have the same species
  SELECT COUNT(DISTINCT c.species_id)
  INTO v_species_count
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  IF v_species_count != 1 THEN
    RAISE EXCEPTION 'All batches must be of the same species to mix';
  END IF;

  -- Get the species_id for code generation
  SELECT DISTINCT c.species_id
  INTO v_species_id
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  -- Validate all batches are from the same IBRA region
  SELECT COUNT(DISTINCT get_ibra_code_from_location(c.location))
  INTO v_ibra_count
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  IF v_ibra_count != 1 THEN
    RAISE EXCEPTION 'All batches must be from the same IBRA region to mix';
  END IF;

  -- Validate all source batches are active and get their current weights
  SELECT
    SUM(bcw.current_weight),
    bool_and(bcw.current_weight > 0)
  INTO v_total_weight, v_all_active
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = ANY (p_source_batch_ids);

  IF NOT v_all_active THEN
    RAISE EXCEPTION 'All source batches must be active (current weight > 0)';
  END IF;

  -- Get the oldest collection date
  SELECT MIN(c.created_at)
  INTO v_oldest_date
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  -- Create new mixed batch (collection_id is NULL since it's a mix of multiple collections)
  INSERT INTO batches (
    id, collection_id, organisation_id, weight_grams, notes, created_at
  ) VALUES (
    gen_random_uuid(), NULL, v_org, v_total_weight, p_notes, v_oldest_date
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on mix');

  -- Record mix sources using batch_merges table
  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  -- Create initial sub-batch for the mixed batch
  INSERT INTO sub_batches (batch_id, weight_grams, notes)
  VALUES (v_new_id, v_total_weight, 'Initial sub-batch from mix');

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_remove_storage_location(p_location_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_location public.storage_locations%ROWTYPE;
BEGIN
  SELECT location.*
  INTO v_location
  FROM public.storage_locations location
  WHERE location.id = p_location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storage location not found';
  END IF;

  IF v_location.organisation_id IS DISTINCT FROM
    public.get_user_organisation_id()
    OR public.auth_org_role() IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Permission denied: organisation admin required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.batch_storage storage
    WHERE storage.location_id = p_location_id
  ) THEN
    UPDATE public.storage_locations
    SET active = false
    WHERE id = p_location_id;

    RETURN 'retired';
  END IF;

  DELETE FROM public.storage_locations
  WHERE id = p_location_id;

  RETURN 'deleted';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_resolve_testing_assignments_for_sub_batch(p_sub_batch_id uuid)
 RETURNS TABLE(assignment_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE ancestors (sub_batch_id) AS (
    VALUES (p_sub_batch_id)
    UNION
    SELECT lineage.source_sub_batch_id
    FROM public.sub_batch_lineage lineage
    INNER JOIN ancestors
      ON ancestors.sub_batch_id = lineage.derived_sub_batch_id
  )
  SELECT DISTINCT assignment.id
  FROM ancestors
  INNER JOIN public.batch_testing_assignment assignment
    ON assignment.sub_batch_id = ancestors.sub_batch_id
  ORDER BY assignment.id;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_return_bag_from_testing(p_assignment_id uuid)
 RETURNS public.batch_testing_assignment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_caller_org_id uuid;
  v_caller_role public.org_user_types;
  v_assignment public.batch_testing_assignment;
  v_owner_org_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT ou.organisation_id, ou.role
    INTO v_caller_org_id, v_caller_role
  FROM public.org_user ou
  WHERE ou.user_id = v_user_id
    AND ou.is_active = true
  ORDER BY ou.joined_at ASC
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Admin role required to return a bag from testing'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_assignment
  FROM public.batch_testing_assignment bta
  WHERE bta.id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testing assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.assigned_to_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'That assignment was not made to your organisation'
      USING ERRCODE = '42501';
  END IF;

  -- Checked ahead of the general closed test so the caller is told why, not
  -- merely that they are too late: testing used the bag up.
  IF v_assignment.outcome = 'consumed' THEN
    RAISE EXCEPTION 'That bag was entirely consumed in testing and cannot be returned'
      USING ERRCODE = '55000';
  END IF;

  IF v_assignment.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'That assignment has already been closed'
      USING ERRCODE = '55000';
  END IF;

  -- The bag goes back to the parent batch's owner. Ownership is the right
  -- answer rather than "whoever sent it" because temporary custody never moves
  -- batches.organisation_id, so the two cannot disagree.
  SELECT b.organisation_id
    INTO v_owner_org_id
  FROM public.batches b
  WHERE b.id = v_assignment.batch_id
  FOR UPDATE;

  IF v_owner_org_id IS NULL THEN
    RAISE EXCEPTION 'Batch not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Symmetric with assignment, which takes the bag off the sender's shelf: a
  -- bag the Testing organisation shelved must not go back still pointing at one
  -- of their storage locations. The owner cannot even resolve that location's
  -- name — storage_locations stays organisation-scoped — so the row would
  -- render as a bag stored nowhere legible. Closed here, while Testing still
  -- holds the bag and so still passes the RPC's own custody gate; the bag is in
  -- transit until the owner stores it again.
  IF EXISTS (
    SELECT 1
    FROM public.batch_storage bs
    WHERE bs.sub_batch_id = v_assignment.sub_batch_id
      AND bs.moved_out_at IS NULL
  ) THEN
    PERFORM public.fn_set_sub_batch_storage(
      v_assignment.sub_batch_id,
      NULL::uuid,
      v_now,
      'Removed from storage: returned from testing'
    );
  END IF;

  UPDATE public.sub_batches
  SET held_by_org_id = v_owner_org_id
  WHERE id = v_assignment.sub_batch_id;

  -- completed_at means "the first test was recorded" and is left alone: a bag
  -- can come back untested, and back-filling the timestamp on return would
  -- make the record claim a test that never happened.
  UPDATE public.batch_testing_assignment bta
  SET closed_at = v_now,
      outcome = 'returned'
  WHERE bta.id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_return_bags_from_testing(p_items jsonb, p_work_status text DEFAULT NULL::text, p_work_status_note text DEFAULT NULL::text, p_is_final boolean DEFAULT false, p_variance_reason text DEFAULT NULL::text)
 RETURNS TABLE(transfer_event_id uuid, transfer_item_id uuid, source_sub_batch_id uuid, returned_sub_batch_id uuid, returned_weight_grams numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_result RECORD;
  v_remaining_weight NUMERIC;
  v_reason TEXT := nullif(btrim(p_variance_reason), '');
BEGIN
  FOR v_result IN
    SELECT movement.*
    FROM public.fn_return_bags_from_testing_without_final_variance(
      p_items,
      p_work_status,
      p_work_status_note
    ) movement
  LOOP
    IF p_is_final THEN
      SELECT weight.current_weight
        INTO v_remaining_weight
      FROM public.sub_batch_current_weight weight
      WHERE weight.id = v_result.source_sub_batch_id;

      IF v_remaining_weight > 0 THEN
        IF v_reason IS NULL THEN
          RAISE EXCEPTION 'A variance reason is required for a final return shortage'
            USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.batch_weight_adjustments (
          sub_batch_id,
          weight_grams,
          reason,
          created_by,
          kind,
          transfer_item_id
        ) VALUES (
          v_result.source_sub_batch_id,
          -v_remaining_weight,
          v_reason,
          v_user_id,
          'variance',
          v_result.transfer_item_id
        );
      END IF;
    END IF;

    transfer_event_id := v_result.transfer_event_id;
    transfer_item_id := v_result.transfer_item_id;
    source_sub_batch_id := v_result.source_sub_batch_id;
    returned_sub_batch_id := v_result.returned_sub_batch_id;
    returned_weight_grams := v_result.returned_weight_grams;
    RETURN NEXT;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_return_bags_from_testing_without_final_variance(p_items jsonb, p_work_status text DEFAULT NULL::text, p_work_status_note text DEFAULT NULL::text)
 RETURNS TABLE(transfer_event_id uuid, transfer_item_id uuid, source_sub_batch_id uuid, returned_sub_batch_id uuid, returned_weight_grams numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_caller_org_id UUID;
  v_caller_role public.org_user_types;
  v_item JSONB;
  v_raw TEXT;
  v_source_id UUID;
  v_source_ids UUID[] := '{}'::UUID[];
  v_assignment_ids UUID[] := '{}'::UUID[];
  v_open_assignment_ids UUID[] := '{}'::UUID[];
  v_assignment_id UUID;
  v_batch_id UUID;
  v_owner_org_id UUID;
  v_request_owner_org_id UUID;
  v_holder_org_id UUID;
  v_current_weight NUMERIC;
  v_return_weight NUMERIC;
  v_returned_ids UUID[];
  v_returned_id UUID;
  v_transfer_event_id UUID;
  v_transfer_item_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT member.organisation_id, member.role
    INTO v_caller_org_id, v_caller_role
  FROM public.org_user member
  WHERE member.user_id = v_user_id
    AND member.is_active = true
  ORDER BY member.joined_at, member.organisation_id
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Testing Admin role required to return seed'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one return item is required'
      USING ERRCODE = '22023';
  END IF;

  -- Parse identifiers before locking so malformed input maps to the public
  -- invalid-parameter contract instead of leaking a cast error.
  FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Every return item must be an object'
        USING ERRCODE = '22023';
    END IF;

    v_raw := nullif(v_item ->> 'sub_batch_id', '');
    IF v_raw IS NULL THEN
      RAISE EXCEPTION 'Every return item requires a sub_batch_id'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_source_id := v_raw::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'sub_batch_id % is not a valid identifier', v_raw
        USING ERRCODE = '22023';
    END;

    IF v_source_id = ANY (v_source_ids) THEN
      RAISE EXCEPTION 'A bag may appear only once in a return request'
        USING ERRCODE = '22023';
    END IF;

    v_source_ids := array_append(v_source_ids, v_source_id);
  END LOOP;

  -- All custody mutations take source bags, assignments, and their immutable
  -- outbound transfer rows in stable UUID order.
  PERFORM 1
  FROM public.sub_batches bag
  WHERE bag.id = ANY (v_source_ids)
  ORDER BY bag.id
  FOR UPDATE;

  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.sub_batches bag
    WHERE bag.id = ANY (v_source_ids)
  ) <> cardinality(v_source_ids) THEN
    RAISE EXCEPTION 'One or more return bags were not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT resolved.assignment_id), '{}'::UUID[])
    INTO v_assignment_ids
  FROM unnest(v_source_ids) source_id
  CROSS JOIN LATERAL
    public.fn_resolve_testing_assignments_for_sub_batch(source_id) resolved;

  IF cardinality(v_assignment_ids) = 0 THEN
    RAISE EXCEPTION 'Returned seed must represent a testing assignment'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = ANY (v_assignment_ids)
  ORDER BY assignment.id
  FOR UPDATE;

  PERFORM 1
  FROM public.seed_transfer_item transfer_item
  WHERE transfer_item.id IN (
    SELECT assignment.outbound_transfer_item_id
    FROM public.batch_testing_assignment assignment
    WHERE assignment.id = ANY (v_assignment_ids)
  )
  ORDER BY transfer_item.id
  FOR KEY SHARE;

  -- Validate every item before writing the transfer header or closing work.
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
    ORDER BY (value ->> 'sub_batch_id')::UUID
  LOOP
    v_source_id := (v_item ->> 'sub_batch_id')::UUID;

    SELECT
      bag.batch_id,
      bag.held_by_org_id,
      batch.organisation_id,
      weight.current_weight
      INTO
        v_batch_id,
        v_holder_org_id,
        v_owner_org_id,
        v_current_weight
    FROM public.sub_batches bag
    INNER JOIN public.batches batch ON batch.id = bag.batch_id
    INNER JOIN public.sub_batch_current_weight weight ON weight.id = bag.id
    WHERE bag.id = v_source_id;

    IF v_holder_org_id IS DISTINCT FROM v_caller_org_id THEN
      RAISE EXCEPTION 'Bag % is not held by your organisation', v_source_id
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.fn_resolve_testing_assignments_for_sub_batch(
        v_source_id
      ) resolved
      INNER JOIN public.batch_testing_assignment assignment
        ON assignment.id = resolved.assignment_id
      WHERE assignment.assigned_to_org_id = v_caller_org_id
    ) THEN
      RAISE EXCEPTION 'Bag % is not part of your testing work', v_source_id
        USING ERRCODE = '42501';
    END IF;

    IF v_request_owner_org_id IS NULL THEN
      v_request_owner_org_id := v_owner_org_id;
    ELSIF v_request_owner_org_id IS DISTINCT FROM v_owner_org_id THEN
      RAISE EXCEPTION 'One return request must have one seed owner'
        USING ERRCODE = '22023';
    END IF;

    IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
      RAISE EXCEPTION 'Bag % has no seed left to return', v_source_id
        USING ERRCODE = '22023';
    END IF;

    v_raw := nullif(v_item ->> 'weight_grams', '');
    IF v_raw IS NULL THEN
      v_return_weight := v_current_weight;
    ELSE
      BEGIN
        v_return_weight := v_raw::NUMERIC;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'weight_grams % is not a number', v_raw
          USING ERRCODE = '22023';
      END;
    END IF;

    IF v_return_weight <= 0 OR v_return_weight > v_current_weight THEN
      RAISE EXCEPTION
        'Return weight for bag % must be positive and no greater than %g',
        v_source_id,
        v_current_weight
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(assignment.id ORDER BY assignment.id), '{}'::UUID[])
    INTO v_open_assignment_ids
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = ANY (v_assignment_ids)
    AND assignment.work_closed_at IS NULL;

  IF cardinality(v_open_assignment_ids) > 0 AND p_work_status IS NULL THEN
    RAISE EXCEPTION 'The first return requires an explicit work status'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_assignment_id IN ARRAY v_open_assignment_ids LOOP
    PERFORM public.fn_set_testing_assignment_work_status(
      v_assignment_id,
      p_work_status,
      p_work_status_note
    );
  END LOOP;

  INSERT INTO public.seed_transfer_event (
    sender_org_id,
    recipient_org_id,
    kind,
    effective_at,
    recorded_at,
    recorded_by
  ) VALUES (
    v_caller_org_id,
    v_request_owner_org_id,
    'return',
    v_now,
    v_now,
    v_user_id
  )
  RETURNING id INTO v_transfer_event_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
    ORDER BY (value ->> 'sub_batch_id')::UUID
  LOOP
    v_source_id := (v_item ->> 'sub_batch_id')::UUID;

    SELECT bag.batch_id, batch.organisation_id, weight.current_weight
      INTO v_batch_id, v_owner_org_id, v_current_weight
    FROM public.sub_batches bag
    INNER JOIN public.batches batch ON batch.id = bag.batch_id
    INNER JOIN public.sub_batch_current_weight weight ON weight.id = bag.id
    WHERE bag.id = v_source_id;

    v_return_weight := COALESCE(
      nullif(v_item ->> 'weight_grams', '')::NUMERIC,
      v_current_weight
    );

    v_returned_ids := public.fn_split_sub_batch(
      v_source_id,
      jsonb_build_array(
        jsonb_build_object(
          'weight_grams', v_return_weight,
          'notes', 'Returned from testing'
        )
      )
    );
    v_returned_id := v_returned_ids[1];

    -- A whole return leaves a zero-weight lab source. Close only that source's
    -- storage; a partial source remains held and stored by the lab.
    IF v_return_weight = v_current_weight AND EXISTS (
      SELECT 1
      FROM public.batch_storage storage
      WHERE storage.sub_batch_id = v_source_id
        AND storage.moved_out_at IS NULL
    ) THEN
      PERFORM public.fn_set_sub_batch_storage(
        v_source_id,
        NULL::UUID,
        v_now,
        'Removed from storage: fully returned from testing'
      );
    END IF;

    UPDATE public.sub_batches bag
    SET held_by_org_id = v_owner_org_id,
        container_id = NULL
    WHERE bag.id = v_returned_id;

    INSERT INTO public.seed_transfer_item (
      transfer_event_id,
      sub_batch_id,
      batch_id,
      owner_org_id,
      weight_grams
    ) VALUES (
      v_transfer_event_id,
      v_returned_id,
      v_batch_id,
      v_owner_org_id,
      v_return_weight
    )
    RETURNING id INTO v_transfer_item_id;

    INSERT INTO public.batch_testing_assignment_return_item (
      assignment_id,
      transfer_item_id
    )
    SELECT resolved.assignment_id, v_transfer_item_id
    FROM public.fn_resolve_testing_assignments_for_sub_batch(
      v_source_id
    ) resolved
    ORDER BY resolved.assignment_id;

    transfer_event_id := v_transfer_event_id;
    transfer_item_id := v_transfer_item_id;
    source_sub_batch_id := v_source_id;
    returned_sub_batch_id := v_returned_id;
    returned_weight_grams := v_return_weight;
    RETURN NEXT;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_sub_batch_storage(p_sub_batch_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_effective_at timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text)
 RETURNS public.batch_storage
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_organisation_id UUID;
  v_current_weight NUMERIC;
  v_current_storage public.batch_storage%ROWTYPE;
  v_result public.batch_storage%ROWTYPE;
BEGIN
  IF p_sub_batch_id IS NULL THEN
    RAISE EXCEPTION 'A sub-batch is required';
  END IF;

  IF p_effective_at IS NULL THEN
    RAISE EXCEPTION 'An effective storage time is required';
  END IF;

  -- Serialize every transition for the sub-batch. The open-row unique index is
  -- a final invariant guard for direct or concurrent writes.
  SELECT sb.batch_id
  INTO v_batch_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Storage is a statement about where a physical bag is, so only whoever
  -- holds it may make one. The owner of the parent batch must not be able to
  -- shelve or move a bag that is currently in a Testing organisation's hands.
  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  SELECT sbcw.current_weight
  INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
    RAISE EXCEPTION 'Only a positive-weight sub-batch can be stored';
  END IF;

  v_organisation_id := public.get_user_organisation_id();

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.storage_locations location
    WHERE location.id = p_location_id
      AND location.organisation_id = v_organisation_id
  ) THEN
    RAISE EXCEPTION 'Invalid storage location %', p_location_id;
  END IF;

  SELECT storage.*
  INTO v_current_storage
  FROM public.batch_storage storage
  WHERE storage.sub_batch_id = p_sub_batch_id
    AND storage.moved_out_at IS NULL
  FOR UPDATE;

  IF NOT FOUND AND p_location_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch is not currently stored';
  END IF;

  IF v_current_storage.id IS NOT NULL
    AND p_location_id = v_current_storage.location_id THEN
    RAISE EXCEPTION 'Sub-batch is already stored at this location';
  END IF;

  IF v_current_storage.id IS NOT NULL
    AND v_current_storage.stored_at IS NOT NULL
    AND p_effective_at < v_current_storage.stored_at THEN
    RAISE EXCEPTION
      'Effective storage time cannot be before the current storage start';
  END IF;

  IF v_current_storage.id IS NOT NULL THEN
    UPDATE public.batch_storage
    SET
      moved_out_at = p_effective_at,
      notes = CASE
        WHEN p_location_id IS NULL THEN p_notes
        ELSE notes
      END
    WHERE id = v_current_storage.id
    RETURNING * INTO v_result;
  END IF;

  IF p_location_id IS NOT NULL THEN
    INSERT INTO public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id,
      stored_at,
      notes
    ) VALUES (
      v_batch_id,
      p_sub_batch_id,
      p_location_id,
      p_effective_at,
      p_notes
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_testing_assignment_work_status(p_assignment_id uuid, p_work_status text, p_note text DEFAULT NULL::text)
 RETURNS public.batch_testing_assignment
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_caller_org_id UUID;
  v_caller_role public.org_user_types;
  v_assignment public.batch_testing_assignment;
  v_old_work_status TEXT;
  v_note TEXT := nullif(btrim(p_note), '');
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  SELECT member.organisation_id, member.role
    INTO v_caller_org_id, v_caller_role
  FROM public.org_user member
  WHERE member.user_id = v_user_id
    AND member.is_active = true
  ORDER BY member.joined_at, member.organisation_id
  LIMIT 1;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Active organisation membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_role IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Testing Admin role required to close or correct work'
      USING ERRCODE = '42501';
  END IF;

  SELECT assignment.*
    INTO v_assignment
  FROM public.batch_testing_assignment assignment
  WHERE assignment.id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testing assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.assigned_to_org_id IS DISTINCT FROM v_caller_org_id THEN
    RAISE EXCEPTION 'Only the assigned testing provider may change work status'
      USING ERRCODE = '42501';
  END IF;

  IF p_work_status IS NULL OR p_work_status NOT IN (
    'completed',
    'partially_completed',
    'not_completed'
  ) THEN
    RAISE EXCEPTION 'Invalid testing work status'
      USING ERRCODE = '22023';
  END IF;

  IF p_work_status IN ('partially_completed', 'not_completed')
    AND v_note IS NULL THEN
    RAISE EXCEPTION 'A note is required for partial or not-completed work'
      USING ERRCODE = '22023';
  END IF;

  IF v_assignment.work_status IS NOT DISTINCT FROM p_work_status
    AND v_assignment.work_status_note IS NOT DISTINCT FROM v_note THEN
    RAISE EXCEPTION 'Testing work already has that status and note'
      USING ERRCODE = '22023';
  END IF;

  v_old_work_status := v_assignment.work_status;

  UPDATE public.batch_testing_assignment assignment
  SET work_closed_at = COALESCE(assignment.work_closed_at, v_now),
      work_closed_by = COALESCE(assignment.work_closed_by, v_user_id),
      work_status = p_work_status,
      work_status_note = v_note
  WHERE assignment.id = p_assignment_id
  RETURNING assignment.* INTO v_assignment;

  INSERT INTO public.batch_testing_assignment_status_audit (
    assignment_id,
    old_work_status,
    new_work_status,
    note,
    actor_id,
    recorded_at
  ) VALUES (
    p_assignment_id,
    v_old_work_status,
    p_work_status,
    v_note,
    v_user_id,
    v_now
  );

  RETURN v_assignment;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_split_batch(p_parent_batch_id uuid, p_weight_grams numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_parent_code text;
  v_child_id uuid;
  v_parent_current_weight numeric;
  v_child_weight numeric;
BEGIN
  -- Caller must be current custodian of the parent
  v_org := current_custodian_org_id(p_parent_batch_id);
  IF v_org IS NULL OR NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of parent batch';
  END IF;

  -- Get parent batch properties for inheritance
  SELECT
    b.collection_id,
    b.code,
    bcw.current_weight
  INTO
    v_collection,
    v_parent_code,
    v_parent_current_weight
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = p_parent_batch_id;

  IF v_collection IS NULL THEN
    RAISE EXCEPTION 'Parent batch not found';
  END IF;

  -- Validate parent batch is active
  IF v_parent_current_weight IS NULL OR v_parent_current_weight <= 0 THEN
    RAISE EXCEPTION 'Parent batch is not active or has no weight remaining';
  END IF;

  -- Determine child weight (provided or default to half of current weight).
  -- The old GREATEST(1, ...) floor existed because integer division truncated
  -- a 1 g parent to 0; numeric halves exactly, so the floor would now round a
  -- legitimate sub-gram split up to a whole gram.
  v_child_weight := COALESCE(p_weight_grams, v_parent_current_weight / 2);

  -- Validate child weight doesn't exceed parent's current weight
  IF v_child_weight > v_parent_current_weight THEN
    RAISE EXCEPTION 'Child weight (% g) exceeds parent current weight (% g)',
      v_child_weight, v_parent_current_weight;
  END IF;

  -- Validate child weight is positive
  IF v_child_weight <= 0 THEN
    RAISE EXCEPTION 'Child batch weight must be greater than 0';
  END IF;

  -- Use provided values or inherit from parent
  INSERT INTO batches (
    id,
    collection_id,
    code,
    organisation_id,
    weight_grams,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_parent_code,  -- Child inherits exact parent code
    v_org,
    v_child_weight,
    p_notes
  )
  RETURNING id INTO v_child_id;

  INSERT INTO batch_splits (parent_batch_id, child_batch_id)
  VALUES (p_parent_batch_id, v_child_id);

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_child_id, v_org, 'Custody inherited on split');

  RETURN v_child_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_split_sub_batch(p_sub_batch_id uuid, p_outputs jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_derived_ids UUID[];
  v_operation_id UUID := gen_random_uuid();
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = p_sub_batch_id;

  v_derived_ids := public.fn_split_sub_batch_without_lineage(
    p_sub_batch_id,
    p_outputs
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    p_sub_batch_id,
    derived_id,
    'split',
    v_operation_id,
    auth.uid()
  FROM unnest(v_derived_ids) derived_id;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'split',
    lineage_operation_id = v_operation_id
  WHERE adjustment.sub_batch_id = p_sub_batch_id
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != 1 THEN
    RAISE EXCEPTION 'Split must create exactly one weight adjustment';
  END IF;

  RETURN v_derived_ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_split_sub_batch_without_lineage(p_sub_batch_id uuid, p_outputs jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_held_by_org_id UUID;
  v_organisation_id UUID;
  v_current_weight NUMERIC;
  v_total_split_weight NUMERIC;
  v_output JSONB;
  v_out_weight NUMERIC;
  v_out_notes TEXT;
  v_container_id UUID;
  v_location_id UUID;
  v_new_id UUID;
  v_new_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Lock the source so simultaneous splits cannot allocate the same weight.
  SELECT sb.batch_id, sb.held_by_org_id
  INTO v_batch_id, v_held_by_org_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  SELECT sbcw.current_weight
  INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  -- Splitting takes weight out of this bag, so the gate is who holds the bag,
  -- not who owns the parent batch. It is also what lets a Testing organisation
  -- retain a subsample of an assigned bag, and what stops the owner carving up
  -- a bag it has already sent away.
  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  v_organisation_id := public.get_user_organisation_id();

  IF p_outputs IS NULL
    OR jsonb_typeof(p_outputs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Outputs must be an array';
  END IF;

  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  SELECT COALESCE(SUM((output.value->>'weight_grams')::NUMERIC), 0)
  INTO v_total_split_weight
  FROM jsonb_array_elements(p_outputs) output;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_outputs) output
    WHERE (output.value->>'weight_grams')::NUMERIC IS NULL
      OR (output.value->>'weight_grams')::NUMERIC <= 0
  ) THEN
    RAISE EXCEPTION 'Each output weight must be greater than 0';
  END IF;

  IF v_total_split_weight > v_current_weight THEN
    RAISE EXCEPTION
      'Total split weight (% g) must be less than current weight (% g)',
      v_total_split_weight,
      v_current_weight;
  END IF;

  -- Validate catalogue references before changing the source weight.
  FOR v_output IN
    SELECT value FROM jsonb_array_elements(p_outputs)
  LOOP
    v_container_id := NULLIF(v_output->>'container_id', '')::UUID;
    v_location_id := NULLIF(v_output->>'location_id', '')::UUID;

    IF v_container_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.containers container
      WHERE container.id = v_container_id
        AND container.organisation_id = v_organisation_id
        AND container.purpose = 'storage'
        AND container.active
    ) THEN
      RAISE EXCEPTION
        'Invalid or inactive storage container %',
        v_container_id;
    END IF;

    IF v_location_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.storage_locations location
      WHERE location.id = v_location_id
        AND location.organisation_id = v_organisation_id
    ) THEN
      RAISE EXCEPTION 'Invalid storage location %', v_location_id;
    END IF;
  END LOOP;

  INSERT INTO public.batch_weight_adjustments (
    sub_batch_id,
    weight_grams,
    reason,
    created_by
  ) VALUES (
    p_sub_batch_id,
    -v_total_split_weight,
    'Split into ' || jsonb_array_length(p_outputs) || ' new sub-batch(es)',
    auth.uid()
  );

  FOR v_output IN
    SELECT value FROM jsonb_array_elements(p_outputs)
  LOOP
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;
    v_out_notes := v_output->>'notes';
    v_container_id := NULLIF(v_output->>'container_id', '')::UUID;
    v_location_id := NULLIF(v_output->>'location_id', '')::UUID;

    -- A child stays with whoever held the material it came from, which the
    -- gate above has already proved is the caller's organisation. Leaving it
    -- to the BEFORE INSERT default would silently hand a Testing
    -- organisation's split back to the batch owner.
    INSERT INTO public.sub_batches (
      batch_id,
      container_id,
      weight_grams,
      notes,
      held_by_org_id
    ) VALUES (
      v_batch_id,
      v_container_id,
      v_out_weight,
      v_out_notes,
      v_held_by_org_id
    )
    RETURNING id INTO v_new_id;

    IF v_location_id IS NOT NULL THEN
      INSERT INTO public.batch_storage (
        batch_id,
        sub_batch_id,
        location_id
      ) VALUES (
        v_batch_id,
        v_new_id,
        v_location_id
      );
    END IF;

    v_new_ids := array_append(v_new_ids, v_new_id);
  END LOOP;

  RETURN v_new_ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_update_batch_cleaning(p_cleaning_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_cleaned BOOLEAN;
  v_organisation_id UUID;
BEGIN
  SELECT bc.is_cleaned, bc.organisation_id
  INTO v_is_cleaned, v_organisation_id
  FROM batch_cleaning bc
  WHERE bc.id = p_cleaning_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cleaning record not found';
  END IF;

  IF v_organisation_id IS DISTINCT FROM get_user_organisation_id() THEN
    RAISE EXCEPTION 'Permission denied: cleaning record belongs to another organisation';
  END IF;

  IF v_is_cleaned AND p_duration IS NULL THEN
    RAISE EXCEPTION 'Cleaning duration is required';
  END IF;

  UPDATE batch_cleaning
  SET
    material_type = p_material_type,
    material_subtype = CASE
      WHEN p_material_type IS NULL THEN NULL
      ELSE p_material_subtype
    END,
    material_notes = p_material_notes,
    cleaning_notes = p_cleaning_notes,
    worker_ids = COALESCE(p_worker_ids, '{}'::UUID[]),
    duration = p_duration
  WHERE id = p_cleaning_id;

  RETURN p_cleaning_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_collection_code(p_collection_id uuid, p_species_id uuid, p_field_name text, p_organisation_id uuid, p_location public.geography, p_created_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    species_name TEXT;
    species_abbrev TEXT;
    org_name TEXT;
    org_abbrev TEXT;
    ibra_code TEXT;
    year_yy TEXT;
    base_code TEXT;
    sequence_num INTEGER;
    final_code TEXT;
BEGIN
    -- Get species name or use field_name or 'Unknown'
    IF p_species_id IS NOT NULL THEN
        SELECT name INTO species_name FROM species WHERE id = p_species_id;
    END IF;

    IF species_name IS NULL OR trim(species_name) = '' THEN
        species_name := COALESCE(nullif(trim(p_field_name), ''), 'Unknown');
    END IF;

    -- Generate species abbreviation
    species_abbrev := generate_species_abbreviation(species_name);

    -- Get organization name and generate abbreviation
    IF p_organisation_id IS NOT NULL THEN
        SELECT name INTO org_name FROM organisation WHERE id = p_organisation_id;
        org_abbrev := generate_org_abbreviation(org_name);
    ELSE
        org_abbrev := 'UNK';
    END IF;

    -- Get IBRA region code
    ibra_code := get_ibra_code_from_location(p_location);

    -- Format year as YY
    year_yy := to_char(COALESCE(p_created_at, now()), 'YY');

    -- Construct the base code (without sequence number)
    base_code := species_abbrev || '-' || org_abbrev || '.' || ibra_code || '.' || year_yy;

    -- Get the next sequence number for this combination within the organization
    sequence_num := get_next_code_sequence(base_code, p_organisation_id, p_collection_id);

    -- Construct the final code with sequence number
    final_code := base_code || '-' || sequence_num::TEXT;

    RETURN final_code;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_species_abbreviation(species_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    words TEXT[];
    word TEXT;
    abbreviation TEXT := '';
    is_phrase_name BOOLEAN := false;
    phrase_location TEXT;
BEGIN
    -- Handle null or empty names
    IF species_name IS NULL OR trim(species_name) = '' THEN
        RETURN 'UNK';
    END IF;

    -- Split the species name into words
    words := string_to_array(trim(species_name), ' ');

    -- Check if this is a phrase name by checking if the second word is exactly 'sp.' or 'sp'
    IF array_length(words, 1) >= 2 AND lower(words[2]) IN ('sp.', 'sp') THEN
        is_phrase_name := true;

        -- Phrase name pattern: "Genus sp. Location (Citation...)"
        -- Generate: Genus (3 letters) + SP + Location (3 letters)

        -- Get the genus (first word)
        abbreviation := upper(left(trim(words[1]), 3));

        -- Add 'SP' for phrase name indicator
        abbreviation := abbreviation || 'SP';

        -- Extract the location text between 'sp.' and the first '('
        -- Use regex to capture everything after 'sp.' or 'sp' and before '('
        phrase_location := regexp_replace(species_name, '^[^\s]+\s+sp\.?\s+([^(]+).*$', '\1', 'i');

        -- Remove all spaces from the location
        phrase_location := regexp_replace(phrase_location, '\s+', '', 'g');

        -- Remove any punctuation
        phrase_location := regexp_replace(phrase_location, '[^a-zA-Z]', '', 'g');

        -- Take first 3 letters of the location
        IF length(phrase_location) > 0 THEN
            abbreviation := abbreviation || upper(left(phrase_location, 3));
        END IF;

        RETURN abbreviation;
    END IF;

    -- Standard species name handling (not a phrase name)
    -- Take first 3 letters from each word, skipping common rank indicators
    FOREACH word IN ARRAY words
    LOOP
        -- Skip rank indicators like 'subsp.', 'var.', 'f.', etc.
        IF length(trim(word)) > 0 AND
           lower(word) NOT IN ('subsp.', 'var.', 'f.', 'subsp', 'var', 'ssp.', 'ssp') THEN
            -- Take first 3 letters (or less if word is shorter)
            abbreviation := abbreviation || upper(left(trim(word), 3));
        END IF;
    END LOOP;

    -- Ensure we have at least something
    IF abbreviation = '' THEN
        RETURN 'UNK';
    END IF;

    RETURN abbreviation;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_merged_batch_inherited_statistics(p_merged_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  source_batch_ids UUID[];
  source_count INTEGER;
  stats_count INTEGER;
  distinct_stats_count INTEGER;
  shared_statistics JSONB;
BEGIN
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(event_details->'source_batch_ids')::UUID
  )
  INTO source_batch_ids
  FROM batch_lineage
  WHERE batch_id = p_merged_batch_id AND creation_event = 'merge';

  IF source_batch_ids IS NULL OR array_length(source_batch_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  source_count := array_length(source_batch_ids, 1);

  WITH source_stats AS (
    SELECT DISTINCT ON (source_id) t.statistics
    FROM unnest(source_batch_ids) AS source_id
    LEFT JOIN tests t ON t.batch_id = source_id AND t.type = 'quality'
    WHERE t.statistics IS NOT NULL
    ORDER BY source_id, t.tested_at DESC
  )
  SELECT COUNT(*), COUNT(DISTINCT statistics), (ARRAY_AGG(statistics))[1]
  INTO stats_count, distinct_stats_count, shared_statistics
  FROM source_stats;

  IF stats_count = source_count AND distinct_stats_count = 1 THEN
    RETURN shared_statistics;
  ELSE
    RETURN NULL;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_next_code_sequence(base_code text, p_organisation_id uuid, p_collection_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    max_sequence INTEGER;
BEGIN
    -- Find the highest sequence number for this base code in this organization
    -- Exclude the current collection if we're updating
    SELECT COALESCE(MAX(
        CAST(
            substring(code from '-(\d+)$')
            AS INTEGER
        )
    ), 0) INTO max_sequence
    FROM collection
    WHERE organisation_id = p_organisation_id
        AND code ~ ('^' || regexp_replace(base_code, '[.*+?^${}()|[\]\\]', '\\\&', 'g') || '-\d+$')
        AND (p_collection_id IS NULL OR id != p_collection_id);

    -- Return the next sequence number
    RETURN COALESCE(max_sequence, 0) + 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_org_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT (SELECT public.auth_org_role()) = 'Admin'
      OR p_permission = ANY (
        COALESCE((SELECT public.auth_org_permissions()), '{}'::text[])
      )
$function$
;

CREATE OR REPLACE FUNCTION public.holds_any_bag_of_batch(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.org_user ou
      ON ou.organisation_id = sb.held_by_org_id
    WHERE sb.batch_id = p_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_batch_custodian_or_past(auth_uid uuid, batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.batch_custody bc
      INNER JOIN public.org_user ou
        ON ou.organisation_id = bc.organisation_id
      WHERE bc.batch_id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$function$
;

CREATE OR REPLACE FUNCTION public.is_batch_owner(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.batches b
    INNER JOIN public.org_user ou
      ON ou.organisation_id = b.organisation_id
    WHERE b.id = p_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_current_bag_custodian(p_user_id uuid, p_sub_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.sub_batches sb
      INNER JOIN public.org_user ou
        ON ou.organisation_id = sb.held_by_org_id
      WHERE sb.id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$function$
;

CREATE OR REPLACE FUNCTION public.is_current_custodian(p_user_id uuid, p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.batches b
      INNER JOIN public.org_user ou
        ON ou.organisation_id = b.organisation_id
      WHERE b.id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$function$
;

CREATE OR REPLACE FUNCTION public.is_linked_testing_provider(p_requesting_org_id uuid, p_provider_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_link
    WHERE requesting_org_id = p_requesting_org_id
      AND provider_org_id = p_provider_org_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(user_id uuid, org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM org_user WHERE org_user.user_id = user_id AND org_user.organisation_id = org_id
  );
$function$
;

create or replace view "public"."obfuscated_collection_data" as  SELECT c.id,
    c.organisation_id,
    to_char(c.created_at, 'Mon YYYY'::text) AS collected_month_year
   FROM public.collection c;


CREATE OR REPLACE FUNCTION public.prevent_container_purpose_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Container purpose cannot be changed after creation'
    USING ERRCODE = '23514';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_seed_transfer_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Seed transfer facts are append-only'
    USING ERRCODE = '55000';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_sub_batch_lineage_rewrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'Sub-batch lineage is append-only'
    USING ERRCODE = '55000';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_testing_assignment_status_audit_rewrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'Testing assignment status audit is append-only'
    USING ERRCODE = '55000';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_org_user_permissions(p_user_id uuid, p_permissions public.org_permission[])
 RETURNS public.org_permission[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org_id uuid := (SELECT public.get_user_organisation_id());
  v_target public.org_user;
  v_permissions public.org_permission[];
BEGIN
  IF (SELECT public.auth_org_role()) IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Only organisation admins can change member permissions'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.org_user
  WHERE user_id = p_user_id
    AND organisation_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a member of your organisation'
      USING ERRCODE = '42501';
  END IF;

  IF v_target.role = 'Admin' THEN
    RAISE EXCEPTION 'Admins already have access to every area'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), '{}'::public.org_permission[])
  INTO v_permissions
  FROM unnest(COALESCE(p_permissions, '{}'::public.org_permission[])) AS t(p);

  UPDATE public.org_user
  SET permissions = v_permissions
  WHERE id = v_target.id;

  RETURN v_permissions;
END;
$function$
;

create or replace view "public"."sub_batch_current_weight" as  SELECT sb.id,
    sb.weight_grams AS original_weight,
    (sb.weight_grams + COALESCE(( SELECT sum(wa.weight_grams) AS sum
           FROM public.batch_weight_adjustments wa
          WHERE (wa.sub_batch_id = sb.id)), (0)::numeric)) AS current_weight
   FROM public.sub_batches sb;


CREATE OR REPLACE FUNCTION public.sub_batch_weight_info(sub_batch_row public.sub_batches)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'original_weight', sbcw.original_weight,
    'current_weight', sbcw.current_weight
  )
  FROM sub_batch_current_weight sbcw
  WHERE sbcw.id = sub_batch_row.id;
$function$
;

CREATE OR REPLACE FUNCTION public.update_quality_test_statistics()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.type = 'quality' AND NEW.result IS NOT NULL THEN
    UPDATE tests
    SET statistics = calculate_quality_test_statistics(NEW.id)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_active_storage_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_holder_organisation_id UUID;
  v_location_organisation_id UUID;
  v_location_active BOOLEAN;
BEGIN
  SELECT sb.held_by_org_id
  INTO v_holder_organisation_id
  FROM public.sub_batches sb
  WHERE sb.id = NEW.sub_batch_id;

  IF v_holder_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Storage row does not reference an existing bag'
      USING ERRCODE = '23514';
  END IF;

  SELECT location.organisation_id, location.active
  INTO v_location_organisation_id, v_location_active
  FROM public.storage_locations location
  WHERE location.id = NEW.location_id;

  IF NOT FOUND OR NOT v_location_active THEN
    RAISE EXCEPTION 'Storage location is inactive or does not exist'
      USING ERRCODE = '23514';
  END IF;

  IF v_location_organisation_id IS DISTINCT FROM
    v_holder_organisation_id THEN
    RAISE EXCEPTION 'Storage location belongs to another organisation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_batch_cleaning_worker_ids()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  invalid_count INTEGER;
BEGIN
  NEW.worker_ids = COALESCE(NEW.worker_ids, '{}'::UUID[]);

  IF cardinality(NEW.worker_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO invalid_count
  FROM unnest(NEW.worker_ids) worker_id
  LEFT JOIN public.person p
    ON p.id = worker_id
    AND p.organisation_id = NEW.organisation_id
  WHERE p.id IS NULL;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'worker_ids must reference people in the same organisation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_seed_transfer_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.batches b
    WHERE b.id = NEW.batch_id
      AND b.organisation_id = NEW.owner_org_id
  ) THEN
    RAISE EXCEPTION 'Transfer owner snapshot must match the parent batch owner'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_sub_batch_lineage_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source_batch_id UUID;
  v_derived_batch_id UUID;
  v_source_owner_org_id UUID;
  v_derived_owner_org_id UUID;
BEGIN
  SELECT sb.batch_id, b.organisation_id
  INTO v_source_batch_id, v_source_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = NEW.source_sub_batch_id;

  SELECT sb.batch_id, b.organisation_id
  INTO v_derived_batch_id, v_derived_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = NEW.derived_sub_batch_id;

  IF v_source_batch_id IS NULL OR v_derived_batch_id IS NULL THEN
    RAISE EXCEPTION 'Lineage bags must exist'
      USING ERRCODE = '23514';
  END IF;

  IF v_source_owner_org_id IS DISTINCT FROM v_derived_owner_org_id THEN
    RAISE EXCEPTION 'Lineage cannot cross seed owners'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind IN ('split', 'merge')
    AND v_source_batch_id IS DISTINCT FROM v_derived_batch_id THEN
    RAISE EXCEPTION '% lineage must stay within one parent batch',
      NEW.operation_kind
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'split' AND EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.operation_kind = 'split'
      AND lineage.operation_id = NEW.operation_id
      AND lineage.source_sub_batch_id <> NEW.source_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'A split operation must have one source bag'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'merge' AND EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.operation_kind = 'merge'
      AND lineage.operation_id = NEW.operation_id
      AND lineage.derived_sub_batch_id <> NEW.derived_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'A merge operation must have one derived bag'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'cleaning' AND NOT EXISTS (
    SELECT 1
    FROM public.batch_cleaning cleaning
    INNER JOIN public.batch_cleaning_output output
      ON output.cleaning_id = cleaning.id
    INNER JOIN public.sub_batches derived
      ON derived.batch_id = output.output_batch_id
    INNER JOIN public.sub_batches source
      ON source.id = NEW.source_sub_batch_id
    WHERE cleaning.id = NEW.operation_id
      AND derived.id = NEW.derived_sub_batch_id
      AND (
        cleaning.input_sub_batch_id = NEW.source_sub_batch_id
        OR (
          cleaning.input_sub_batch_id IS NULL
          AND source.batch_id = output.output_batch_id
          AND derived.batch_id = source.batch_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Cleaning lineage must match its cleaning input and output'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH RECURSIVE descendants (sub_batch_id) AS (
      SELECT NEW.derived_sub_batch_id
      UNION
      SELECT lineage.derived_sub_batch_id
      FROM public.sub_batch_lineage lineage
      INNER JOIN descendants
        ON descendants.sub_batch_id = lineage.source_sub_batch_id
    )
    SELECT 1
    FROM descendants
    WHERE sub_batch_id = NEW.source_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'Lineage edge would create a cycle'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_sub_batch_storage_container()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.container_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- held_by_org_id is NOT NULL and is filled by sub_batches_default_held_by,
  -- which sorts before this trigger and so has already run.
  IF NOT EXISTS (
    SELECT 1
    FROM public.containers container
    WHERE container.id = NEW.container_id
      AND container.organisation_id = NEW.held_by_org_id
      AND container.purpose = 'storage'
      AND container.active
  ) THEN
    RAISE EXCEPTION
      'Storage container is inactive, invalid, or belongs to another organisation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_testing_provider_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.validate_treatment_array(treats jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  valid_treats TEXT[] := ARRAY['sort', 'coat', 'treat', 'other'];
  treat_value TEXT;
BEGIN
  IF jsonb_typeof(treats) != 'array' THEN
    RETURN FALSE;
  END IF;

  IF jsonb_array_length(treats) = 0 THEN
    RETURN FALSE;
  END IF;

  FOR treat_value IN SELECT jsonb_array_elements_text(treats)
  LOOP
    IF NOT (treat_value = ANY(valid_treats)) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_populate_collection_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Generate code for new records
    IF TG_OP = 'INSERT' THEN
        NEW.code := generate_collection_code(
            NEW.id,
            NEW.species_id,
            NEW.field_name,
            NEW.organisation_id,
            NEW.location,
            NEW.created_at
        );
        RETURN NEW;
    END IF;

    -- Update code if relevant fields change
    IF TG_OP = 'UPDATE' THEN
        -- Check if any of the fields that affect the code have changed
        IF (OLD.species_id IS DISTINCT FROM NEW.species_id) OR
           (OLD.field_name IS DISTINCT FROM NEW.field_name) OR
           (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) OR
           (OLD.location IS DISTINCT FROM NEW.location) THEN
            NEW.code := generate_collection_code(
                NEW.id,
                NEW.species_id,
                NEW.field_name,
                NEW.organisation_id,
                NEW.location,
                NEW.created_at
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  claims jsonb;
  app_meta jsonb;
  org_row record;
begin
  claims := event->'claims';
  app_meta := coalesce(claims->'app_metadata', '{}'::jsonb);

  select
    ou.organisation_id,
    ou.role::text as role,
    ou.permissions,
    o.name as organisation_name
  into org_row
  from public.org_user ou
  join public.organisation o on o.id = ou.organisation_id
  where ou.user_id = (event->>'user_id')::uuid
    and ou.is_active = true
  order by ou.joined_at asc
  limit 1;

  if org_row.organisation_id is not null then
    app_meta := app_meta
      || jsonb_build_object(
           'org_id', org_row.organisation_id,
           'org_name', org_row.organisation_name,
           'role', org_row.role,
           'permissions', to_jsonb(
             coalesce(org_row.permissions, '{}'::public.org_permission[])::text[]
           )
         );
    claims := jsonb_set(claims, '{app_metadata}', app_meta);
  end if;

  return jsonb_build_object('claims', claims);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_org_abbreviation(org_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    words TEXT[];
    word TEXT;
    abbreviation TEXT := '';
BEGIN
    -- Handle null or empty names
    IF org_name IS NULL OR trim(org_name) = '' THEN
        RETURN 'UNK';
    END IF;

    -- Split the organization name into words
    words := string_to_array(trim(org_name), ' ');

    -- If single word, take first 3 characters
    IF array_length(words, 1) = 1 THEN
        RETURN upper(left(words[1], 3));
    END IF;

    -- If multiple words, take first letter of each word
    FOREACH word IN ARRAY words
    LOOP
        -- Only include non-empty words and skip common articles/prepositions
        IF length(trim(word)) > 0 AND lower(word) NOT IN ('the', 'of', 'and', 'for', 'in', 'on', 'at', 'to', 'a', 'an') THEN
            abbreviation := abbreviation || upper(left(trim(word), 1));
        END IF;
    END LOOP;

    -- Ensure we have at least something
    IF abbreviation = '' THEN
        RETURN upper(left(org_name, 3));
    END IF;

    RETURN abbreviation;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ibra_code_from_location(location_geom public.geography)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    ibra_code TEXT;
BEGIN
    -- Handle null location
    IF location_geom IS NULL THEN
        RETURN 'UNK';
    END IF;

    -- Find intersecting IBRA region using geom_high for precision
    SELECT code INTO ibra_code
    FROM ibra_regions
    WHERE ST_Intersects(geom_high, location_geom::geometry)
    LIMIT 1;

    -- Return the code or 'UNK' if no intersection found
    RETURN COALESCE(ibra_code, 'UNK');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_organisation_users()
 RETURNS TABLE(id uuid, email text, name text, organisation_id uuid, joined_at timestamp with time zone, role public.org_user_types, permissions public.org_permission[], is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH user_organisations AS (
        SELECT DISTINCT o.organisation_id AS org_id
        FROM public.org_user o
        WHERE o.user_id = auth.uid()
    )
    SELECT
        u.id::UUID,
        u.email::TEXT,
        (u.raw_user_meta_data->>'name')::TEXT AS name,
        o.organisation_id::UUID,
        o.joined_at::timestamptz,
        o.role::org_user_types,
        o.permissions::public.org_permission[],
        o.is_active::BOOLEAN
    FROM auth.users u
    JOIN public.org_user o ON u.id = o.user_id
    JOIN user_organisations uo ON o.organisation_id = uo.org_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_organisation_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT NULLIF(
    (SELECT auth.jwt()) -> 'app_metadata' ->> 'org_id',
    ''
  )::uuid
$function$
;

CREATE OR REPLACE FUNCTION public.load_ibra7_regions_paginated()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    base_url TEXT := 'https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/IBRA7_Regions/FeatureServer/0/query';
    base_params TEXT := '?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&returnTrueCurves=false&returnExceededLimitFeatures=false&quantizationParameters=&returnCentroid=false&timeReferenceUnknownClient=false&sqlFormat=none&resultType=&featureEncoding=esriDefault&datumTransformation=&f=geojson';
    
    current_offset INT := 0;
    chunk_size INT := 5;
    response RECORD;
    geojson_data JSONB;
    features_array JSONB;
    feature_count INT;
    total_loaded INT := 0;
    query_url TEXT;
BEGIN
    -- Check if already loaded
    IF EXISTS (SELECT 1 FROM ibra_regions LIMIT 1) THEN
        RAISE NOTICE 'IBRA7 regions already loaded';
        RETURN;
    END IF;


    -- Create temporary table to store original data
    CREATE TEMP TABLE temp_ibra_original (
        geom GEOMETRY,
        properties JSONB,
        name TEXT,
        source_id BIGINT,
        reg_code TEXT
    );

    RAISE NOTICE 'Starting to load IBRA7 regions in chunks of %', chunk_size;

    LOOP
        -- Build paginated query URL
        query_url := base_url || base_params || 
            '&resultOffset=' || current_offset ||
            '&resultRecordCount=' || chunk_size;

        RAISE NOTICE 'Fetching chunk: offset=%, size=%', current_offset, chunk_size;
        RAISE NOTICE 'Query URL: %', query_url;

        SELECT status, content INTO response FROM http_get(query_url);

        IF response.status != 200 THEN
            RAISE WARNING 'Failed to fetch chunk at offset %: HTTP %', current_offset, response.status;
            EXIT;
        END IF;

        geojson_data := response.content::JSONB;

        -- Validate response
        IF geojson_data IS NULL OR geojson_data->>'type' != 'FeatureCollection' THEN
            RAISE WARNING 'Invalid GeoJSON response at offset %', current_offset;
            EXIT;
        END IF;

        features_array := geojson_data->'features';
        feature_count := jsonb_array_length(features_array);

        RAISE NOTICE 'Received % features in this chunk', feature_count;

        -- Exit if no more features
        IF feature_count = 0 THEN
            RAISE NOTICE 'No more features found at offset %', current_offset;
            EXIT;
        END IF;

        -- Insert this chunk's features
        INSERT INTO temp_ibra_original (geom, properties, name, source_id, reg_code)
        SELECT 
            ST_GeomFromGeoJSON(feature->>'geometry'),  -- Original geometry
            feature->'properties',
            feature->'properties'->>'REG_NAME_7',
            (feature->'properties'->>'OBJECTID')::BIGINT,
            feature->'properties'->>'REG_CODE_7'
        FROM jsonb_array_elements(features_array) AS feature
        WHERE feature->>'geometry' IS NOT NULL;
    
        GET DIAGNOSTICS feature_count = ROW_COUNT;
        total_loaded := total_loaded + feature_count;
        current_offset := current_offset + chunk_size;

        RAISE NOTICE 'Inserted % features with geometry (% total so far)', feature_count, total_loaded;

        -- Small delay to be respectful to the service
        PERFORM pg_sleep(0.2);

        -- Safety check to prevent infinite loops
        IF current_offset > 1000 THEN
            RAISE WARNING 'Safety limit reached at % features', total_loaded;
            EXIT;
        END IF;
    END LOOP;

    RAISE NOTICE 'Completed loading % IBRA7 regions', total_loaded;
    
    -- Step 3: Now simplify all geometries together and insert into final table
    RAISE NOTICE 'Simplifying % regions while preserving topology...', 
        (SELECT COUNT(*) FROM temp_ibra_original);

    INSERT INTO ibra_regions (geom_high, geom_medium, geom_low, properties, name, code)
    SELECT 
        ST_SimplifyPreserveTopology(geom, 0.001) as geom_high,
        ST_SimplifyPreserveTopology(geom, 0.005) as geom_medium,
        ST_SimplifyPreserveTopology(geom, 0.02) as geom_low,
        properties,
        name,
        reg_code
    FROM temp_ibra_original;
END $function$
;

create or replace view "public"."active_batches" as  WITH computed AS (
         SELECT DISTINCT b.id,
            b.collection_id,
            b.organisation_id,
            b.created_at,
            b.weight_grams,
            b.notes,
            b.code,
            bcw.original_weight,
            bcw.current_weight,
            cbs.location_id AS current_location_id,
            c.species_id,
            ( WITH RECURSIVE ancestors AS (
                         SELECT batch_lineage.batch_id,
                            batch_lineage.parent_batch_id,
                            batch_lineage.event_details,
                            batch_lineage.creation_event
                           FROM public.batch_lineage
                          WHERE (batch_lineage.batch_id = b.id)
                        UNION
                         SELECT bl.batch_id,
                            bl.parent_batch_id,
                            bl.event_details,
                            bl.creation_event
                           FROM (public.batch_lineage bl
                             JOIN ancestors a ON (((bl.batch_id = a.parent_batch_id) OR ((a.creation_event = 'merge'::text) AND (bl.batch_id IN ( SELECT (jsonb_array_elements_text((a.event_details -> 'source_batch_ids'::text)))::uuid AS jsonb_array_elements_text))))))
                        )
                 SELECT (EXISTS ( SELECT 1
                           FROM ancestors
                          WHERE (ancestors.creation_event = 'treating'::text))) AS "exists") AS is_treated,
            ((EXISTS ( SELECT 1
                   FROM public.batch_cleaning_output bco
                  WHERE (bco.output_batch_id = b.id))) OR (EXISTS ( WITH RECURSIVE ancestors AS (
                         SELECT batch_lineage.batch_id,
                            batch_lineage.parent_batch_id,
                            batch_lineage.creation_event
                           FROM public.batch_lineage
                          WHERE (batch_lineage.batch_id = b.id)
                        UNION
                         SELECT bl.batch_id,
                            bl.parent_batch_id,
                            bl.creation_event
                           FROM (public.batch_lineage bl
                             JOIN ancestors a ON ((bl.batch_id = a.parent_batch_id)))
                        )
                 SELECT 1
                   FROM (ancestors anc
                     JOIN public.batch_cleaning bc ON ((bc.input_batch_id = anc.batch_id)))))) AS is_cleaned,
            COALESCE(( SELECT t.statistics
                   FROM public.tests t
                  WHERE ((t.batch_id = b.id) AND (t.type = 'quality'::text) AND (t.statistics IS NOT NULL))
                  ORDER BY t.tested_at DESC
                 LIMIT 1), ( SELECT t.statistics
                   FROM public.tests t
                  WHERE ((t.batch_id = ( SELECT batch_lineage.parent_batch_id
                           FROM public.batch_lineage
                          WHERE ((batch_lineage.batch_id = b.id) AND (batch_lineage.creation_event = 'split'::text)))) AND (t.type = 'quality'::text) AND (t.statistics IS NOT NULL))
                  ORDER BY t.tested_at DESC
                 LIMIT 1), public.get_merged_batch_inherited_statistics(b.id)) AS latest_quality_statistics
           FROM (((public.batches b
             JOIN public.batch_current_weight bcw ON ((bcw.id = b.id)))
             LEFT JOIN public.collection c ON ((c.id = b.collection_id)))
             LEFT JOIN LATERAL ( SELECT current_batch_storage.location_id
                   FROM public.current_batch_storage
                  WHERE (current_batch_storage.batch_id = b.id)
                  ORDER BY current_batch_storage.stored_at DESC
                 LIMIT 1) cbs ON (true))
          WHERE ((bcw.current_weight > (0)::numeric) OR (bcw.current_weight IS NULL))
        )
 SELECT computed.id,
    computed.collection_id,
    computed.organisation_id,
    computed.created_at,
    computed.weight_grams,
    computed.notes,
    computed.code,
    computed.original_weight,
    computed.current_weight,
    computed.current_location_id,
    computed.species_id,
    computed.is_treated,
    computed.is_cleaned,
    computed.latest_quality_statistics
   FROM computed
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.batch_cleaning bc
          WHERE (bc.input_batch_id = computed.id))));


create or replace view "public"."active_sub_batches" as  SELECT sb.id,
    sb.batch_id,
    sb.weight_grams,
    sb.notes,
    sb.created_at,
    sb.held_by_org_id,
    sbcw.original_weight,
    sbcw.current_weight,
    cbs.location_id AS current_location_id,
    sb.container_id
   FROM ((public.sub_batches sb
     JOIN public.sub_batch_current_weight sbcw ON ((sbcw.id = sb.id)))
     LEFT JOIN LATERAL ( SELECT current_batch_storage.location_id
           FROM public.current_batch_storage
          WHERE (current_batch_storage.sub_batch_id = sb.id)
          ORDER BY current_batch_storage.stored_at DESC
         LIMIT 1) cbs ON (true))
  WHERE (((sbcw.current_weight > (0)::numeric) OR (sbcw.current_weight IS NULL)) AND (sb.held_by_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (NOT (EXISTS ( SELECT 1
           FROM public.batch_merges bm
          WHERE (bm.source_batch_id = sb.batch_id)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.batch_cleaning bc
          WHERE (bc.input_sub_batch_id = sb.id)))));


grant delete on table "public"."batch_cleaning" to "anon";

grant insert on table "public"."batch_cleaning" to "anon";

grant references on table "public"."batch_cleaning" to "anon";

grant trigger on table "public"."batch_cleaning" to "anon";

grant truncate on table "public"."batch_cleaning" to "anon";

grant update on table "public"."batch_cleaning" to "anon";

grant delete on table "public"."batch_cleaning" to "authenticated";

grant insert on table "public"."batch_cleaning" to "authenticated";

grant references on table "public"."batch_cleaning" to "authenticated";

grant select on table "public"."batch_cleaning" to "authenticated";

grant trigger on table "public"."batch_cleaning" to "authenticated";

grant truncate on table "public"."batch_cleaning" to "authenticated";

grant update on table "public"."batch_cleaning" to "authenticated";

grant select on table "public"."batch_cleaning" to "powersync_role";

grant delete on table "public"."batch_cleaning" to "service_role";

grant insert on table "public"."batch_cleaning" to "service_role";

grant references on table "public"."batch_cleaning" to "service_role";

grant select on table "public"."batch_cleaning" to "service_role";

grant trigger on table "public"."batch_cleaning" to "service_role";

grant truncate on table "public"."batch_cleaning" to "service_role";

grant update on table "public"."batch_cleaning" to "service_role";

grant delete on table "public"."batch_cleaning_output" to "anon";

grant insert on table "public"."batch_cleaning_output" to "anon";

grant references on table "public"."batch_cleaning_output" to "anon";

grant trigger on table "public"."batch_cleaning_output" to "anon";

grant truncate on table "public"."batch_cleaning_output" to "anon";

grant update on table "public"."batch_cleaning_output" to "anon";

grant delete on table "public"."batch_cleaning_output" to "authenticated";

grant insert on table "public"."batch_cleaning_output" to "authenticated";

grant references on table "public"."batch_cleaning_output" to "authenticated";

grant select on table "public"."batch_cleaning_output" to "authenticated";

grant trigger on table "public"."batch_cleaning_output" to "authenticated";

grant truncate on table "public"."batch_cleaning_output" to "authenticated";

grant update on table "public"."batch_cleaning_output" to "authenticated";

grant select on table "public"."batch_cleaning_output" to "powersync_role";

grant delete on table "public"."batch_cleaning_output" to "service_role";

grant insert on table "public"."batch_cleaning_output" to "service_role";

grant references on table "public"."batch_cleaning_output" to "service_role";

grant select on table "public"."batch_cleaning_output" to "service_role";

grant trigger on table "public"."batch_cleaning_output" to "service_role";

grant truncate on table "public"."batch_cleaning_output" to "service_role";

grant update on table "public"."batch_cleaning_output" to "service_role";

grant delete on table "public"."batch_cleaning_photo" to "anon";

grant insert on table "public"."batch_cleaning_photo" to "anon";

grant references on table "public"."batch_cleaning_photo" to "anon";

grant trigger on table "public"."batch_cleaning_photo" to "anon";

grant truncate on table "public"."batch_cleaning_photo" to "anon";

grant update on table "public"."batch_cleaning_photo" to "anon";

grant delete on table "public"."batch_cleaning_photo" to "authenticated";

grant insert on table "public"."batch_cleaning_photo" to "authenticated";

grant references on table "public"."batch_cleaning_photo" to "authenticated";

grant select on table "public"."batch_cleaning_photo" to "authenticated";

grant trigger on table "public"."batch_cleaning_photo" to "authenticated";

grant truncate on table "public"."batch_cleaning_photo" to "authenticated";

grant update on table "public"."batch_cleaning_photo" to "authenticated";

grant select on table "public"."batch_cleaning_photo" to "powersync_role";

grant delete on table "public"."batch_cleaning_photo" to "service_role";

grant insert on table "public"."batch_cleaning_photo" to "service_role";

grant references on table "public"."batch_cleaning_photo" to "service_role";

grant select on table "public"."batch_cleaning_photo" to "service_role";

grant trigger on table "public"."batch_cleaning_photo" to "service_role";

grant truncate on table "public"."batch_cleaning_photo" to "service_role";

grant update on table "public"."batch_cleaning_photo" to "service_role";

grant delete on table "public"."batch_custody" to "anon";

grant insert on table "public"."batch_custody" to "anon";

grant references on table "public"."batch_custody" to "anon";

grant trigger on table "public"."batch_custody" to "anon";

grant truncate on table "public"."batch_custody" to "anon";

grant update on table "public"."batch_custody" to "anon";

grant delete on table "public"."batch_custody" to "authenticated";

grant insert on table "public"."batch_custody" to "authenticated";

grant references on table "public"."batch_custody" to "authenticated";

grant select on table "public"."batch_custody" to "authenticated";

grant trigger on table "public"."batch_custody" to "authenticated";

grant truncate on table "public"."batch_custody" to "authenticated";

grant update on table "public"."batch_custody" to "authenticated";

grant select on table "public"."batch_custody" to "powersync_role";

grant delete on table "public"."batch_custody" to "service_role";

grant insert on table "public"."batch_custody" to "service_role";

grant references on table "public"."batch_custody" to "service_role";

grant select on table "public"."batch_custody" to "service_role";

grant trigger on table "public"."batch_custody" to "service_role";

grant truncate on table "public"."batch_custody" to "service_role";

grant update on table "public"."batch_custody" to "service_role";

grant delete on table "public"."batch_merges" to "anon";

grant insert on table "public"."batch_merges" to "anon";

grant references on table "public"."batch_merges" to "anon";

grant trigger on table "public"."batch_merges" to "anon";

grant truncate on table "public"."batch_merges" to "anon";

grant update on table "public"."batch_merges" to "anon";

grant delete on table "public"."batch_merges" to "authenticated";

grant insert on table "public"."batch_merges" to "authenticated";

grant references on table "public"."batch_merges" to "authenticated";

grant select on table "public"."batch_merges" to "authenticated";

grant trigger on table "public"."batch_merges" to "authenticated";

grant truncate on table "public"."batch_merges" to "authenticated";

grant update on table "public"."batch_merges" to "authenticated";

grant select on table "public"."batch_merges" to "powersync_role";

grant delete on table "public"."batch_merges" to "service_role";

grant insert on table "public"."batch_merges" to "service_role";

grant references on table "public"."batch_merges" to "service_role";

grant select on table "public"."batch_merges" to "service_role";

grant trigger on table "public"."batch_merges" to "service_role";

grant truncate on table "public"."batch_merges" to "service_role";

grant update on table "public"."batch_merges" to "service_role";

grant delete on table "public"."batch_splits" to "anon";

grant insert on table "public"."batch_splits" to "anon";

grant references on table "public"."batch_splits" to "anon";

grant trigger on table "public"."batch_splits" to "anon";

grant truncate on table "public"."batch_splits" to "anon";

grant update on table "public"."batch_splits" to "anon";

grant delete on table "public"."batch_splits" to "authenticated";

grant insert on table "public"."batch_splits" to "authenticated";

grant references on table "public"."batch_splits" to "authenticated";

grant select on table "public"."batch_splits" to "authenticated";

grant trigger on table "public"."batch_splits" to "authenticated";

grant truncate on table "public"."batch_splits" to "authenticated";

grant update on table "public"."batch_splits" to "authenticated";

grant select on table "public"."batch_splits" to "powersync_role";

grant delete on table "public"."batch_splits" to "service_role";

grant insert on table "public"."batch_splits" to "service_role";

grant references on table "public"."batch_splits" to "service_role";

grant select on table "public"."batch_splits" to "service_role";

grant trigger on table "public"."batch_splits" to "service_role";

grant truncate on table "public"."batch_splits" to "service_role";

grant update on table "public"."batch_splits" to "service_role";

grant delete on table "public"."batch_storage" to "anon";

grant insert on table "public"."batch_storage" to "anon";

grant references on table "public"."batch_storage" to "anon";

grant trigger on table "public"."batch_storage" to "anon";

grant truncate on table "public"."batch_storage" to "anon";

grant update on table "public"."batch_storage" to "anon";

grant delete on table "public"."batch_storage" to "authenticated";

grant insert on table "public"."batch_storage" to "authenticated";

grant references on table "public"."batch_storage" to "authenticated";

grant select on table "public"."batch_storage" to "authenticated";

grant trigger on table "public"."batch_storage" to "authenticated";

grant truncate on table "public"."batch_storage" to "authenticated";

grant update on table "public"."batch_storage" to "authenticated";

grant select on table "public"."batch_storage" to "powersync_role";

grant delete on table "public"."batch_storage" to "service_role";

grant insert on table "public"."batch_storage" to "service_role";

grant references on table "public"."batch_storage" to "service_role";

grant select on table "public"."batch_storage" to "service_role";

grant trigger on table "public"."batch_storage" to "service_role";

grant truncate on table "public"."batch_storage" to "service_role";

grant update on table "public"."batch_storage" to "service_role";

grant delete on table "public"."batch_testing_assignment" to "anon";

grant insert on table "public"."batch_testing_assignment" to "anon";

grant references on table "public"."batch_testing_assignment" to "anon";

grant trigger on table "public"."batch_testing_assignment" to "anon";

grant truncate on table "public"."batch_testing_assignment" to "anon";

grant update on table "public"."batch_testing_assignment" to "anon";

grant delete on table "public"."batch_testing_assignment" to "authenticated";

grant insert on table "public"."batch_testing_assignment" to "authenticated";

grant references on table "public"."batch_testing_assignment" to "authenticated";

grant select on table "public"."batch_testing_assignment" to "authenticated";

grant trigger on table "public"."batch_testing_assignment" to "authenticated";

grant truncate on table "public"."batch_testing_assignment" to "authenticated";

grant update on table "public"."batch_testing_assignment" to "authenticated";

grant select on table "public"."batch_testing_assignment" to "powersync_role";

grant delete on table "public"."batch_testing_assignment" to "service_role";

grant insert on table "public"."batch_testing_assignment" to "service_role";

grant references on table "public"."batch_testing_assignment" to "service_role";

grant select on table "public"."batch_testing_assignment" to "service_role";

grant trigger on table "public"."batch_testing_assignment" to "service_role";

grant truncate on table "public"."batch_testing_assignment" to "service_role";

grant update on table "public"."batch_testing_assignment" to "service_role";

grant delete on table "public"."batch_testing_assignment_return_item" to "anon";

grant insert on table "public"."batch_testing_assignment_return_item" to "anon";

grant references on table "public"."batch_testing_assignment_return_item" to "anon";

grant trigger on table "public"."batch_testing_assignment_return_item" to "anon";

grant truncate on table "public"."batch_testing_assignment_return_item" to "anon";

grant update on table "public"."batch_testing_assignment_return_item" to "anon";

grant references on table "public"."batch_testing_assignment_return_item" to "authenticated";

grant select on table "public"."batch_testing_assignment_return_item" to "authenticated";

grant trigger on table "public"."batch_testing_assignment_return_item" to "authenticated";

grant select on table "public"."batch_testing_assignment_return_item" to "powersync_role";

grant delete on table "public"."batch_testing_assignment_return_item" to "service_role";

grant insert on table "public"."batch_testing_assignment_return_item" to "service_role";

grant references on table "public"."batch_testing_assignment_return_item" to "service_role";

grant select on table "public"."batch_testing_assignment_return_item" to "service_role";

grant trigger on table "public"."batch_testing_assignment_return_item" to "service_role";

grant truncate on table "public"."batch_testing_assignment_return_item" to "service_role";

grant update on table "public"."batch_testing_assignment_return_item" to "service_role";

grant delete on table "public"."batch_testing_assignment_status_audit" to "anon";

grant insert on table "public"."batch_testing_assignment_status_audit" to "anon";

grant references on table "public"."batch_testing_assignment_status_audit" to "anon";

grant trigger on table "public"."batch_testing_assignment_status_audit" to "anon";

grant truncate on table "public"."batch_testing_assignment_status_audit" to "anon";

grant update on table "public"."batch_testing_assignment_status_audit" to "anon";

grant references on table "public"."batch_testing_assignment_status_audit" to "authenticated";

grant select on table "public"."batch_testing_assignment_status_audit" to "authenticated";

grant trigger on table "public"."batch_testing_assignment_status_audit" to "authenticated";

grant select on table "public"."batch_testing_assignment_status_audit" to "powersync_role";

grant delete on table "public"."batch_testing_assignment_status_audit" to "service_role";

grant insert on table "public"."batch_testing_assignment_status_audit" to "service_role";

grant references on table "public"."batch_testing_assignment_status_audit" to "service_role";

grant select on table "public"."batch_testing_assignment_status_audit" to "service_role";

grant trigger on table "public"."batch_testing_assignment_status_audit" to "service_role";

grant truncate on table "public"."batch_testing_assignment_status_audit" to "service_role";

grant update on table "public"."batch_testing_assignment_status_audit" to "service_role";

grant delete on table "public"."batch_weight_adjustments" to "anon";

grant insert on table "public"."batch_weight_adjustments" to "anon";

grant references on table "public"."batch_weight_adjustments" to "anon";

grant trigger on table "public"."batch_weight_adjustments" to "anon";

grant truncate on table "public"."batch_weight_adjustments" to "anon";

grant update on table "public"."batch_weight_adjustments" to "anon";

grant delete on table "public"."batch_weight_adjustments" to "authenticated";

grant insert on table "public"."batch_weight_adjustments" to "authenticated";

grant references on table "public"."batch_weight_adjustments" to "authenticated";

grant select on table "public"."batch_weight_adjustments" to "authenticated";

grant trigger on table "public"."batch_weight_adjustments" to "authenticated";

grant truncate on table "public"."batch_weight_adjustments" to "authenticated";

grant update on table "public"."batch_weight_adjustments" to "authenticated";

grant select on table "public"."batch_weight_adjustments" to "powersync_role";

grant delete on table "public"."batch_weight_adjustments" to "service_role";

grant insert on table "public"."batch_weight_adjustments" to "service_role";

grant references on table "public"."batch_weight_adjustments" to "service_role";

grant select on table "public"."batch_weight_adjustments" to "service_role";

grant trigger on table "public"."batch_weight_adjustments" to "service_role";

grant truncate on table "public"."batch_weight_adjustments" to "service_role";

grant update on table "public"."batch_weight_adjustments" to "service_role";

grant delete on table "public"."batches" to "anon";

grant insert on table "public"."batches" to "anon";

grant references on table "public"."batches" to "anon";

grant trigger on table "public"."batches" to "anon";

grant truncate on table "public"."batches" to "anon";

grant update on table "public"."batches" to "anon";

grant delete on table "public"."batches" to "authenticated";

grant insert on table "public"."batches" to "authenticated";

grant references on table "public"."batches" to "authenticated";

grant select on table "public"."batches" to "authenticated";

grant trigger on table "public"."batches" to "authenticated";

grant truncate on table "public"."batches" to "authenticated";

grant update on table "public"."batches" to "authenticated";

grant select on table "public"."batches" to "powersync_role";

grant delete on table "public"."batches" to "service_role";

grant insert on table "public"."batches" to "service_role";

grant references on table "public"."batches" to "service_role";

grant select on table "public"."batches" to "service_role";

grant trigger on table "public"."batches" to "service_role";

grant truncate on table "public"."batches" to "service_role";

grant update on table "public"."batches" to "service_role";

grant delete on table "public"."collection_containers" to "anon";

grant insert on table "public"."collection_containers" to "anon";

grant references on table "public"."collection_containers" to "anon";

grant trigger on table "public"."collection_containers" to "anon";

grant truncate on table "public"."collection_containers" to "anon";

grant update on table "public"."collection_containers" to "anon";

grant delete on table "public"."collection_containers" to "authenticated";

grant insert on table "public"."collection_containers" to "authenticated";

grant references on table "public"."collection_containers" to "authenticated";

grant select on table "public"."collection_containers" to "authenticated";

grant trigger on table "public"."collection_containers" to "authenticated";

grant truncate on table "public"."collection_containers" to "authenticated";

grant update on table "public"."collection_containers" to "authenticated";

grant select on table "public"."collection_containers" to "powersync_role";

grant delete on table "public"."collection_containers" to "service_role";

grant insert on table "public"."collection_containers" to "service_role";

grant references on table "public"."collection_containers" to "service_role";

grant select on table "public"."collection_containers" to "service_role";

grant trigger on table "public"."collection_containers" to "service_role";

grant truncate on table "public"."collection_containers" to "service_role";

grant update on table "public"."collection_containers" to "service_role";

grant delete on table "public"."containers" to "anon";

grant insert on table "public"."containers" to "anon";

grant references on table "public"."containers" to "anon";

grant trigger on table "public"."containers" to "anon";

grant truncate on table "public"."containers" to "anon";

grant update on table "public"."containers" to "anon";

grant delete on table "public"."containers" to "authenticated";

grant insert on table "public"."containers" to "authenticated";

grant references on table "public"."containers" to "authenticated";

grant select on table "public"."containers" to "authenticated";

grant trigger on table "public"."containers" to "authenticated";

grant truncate on table "public"."containers" to "authenticated";

grant update on table "public"."containers" to "authenticated";

grant select on table "public"."containers" to "powersync_role";

grant delete on table "public"."containers" to "service_role";

grant insert on table "public"."containers" to "service_role";

grant references on table "public"."containers" to "service_role";

grant select on table "public"."containers" to "service_role";

grant trigger on table "public"."containers" to "service_role";

grant truncate on table "public"."containers" to "service_role";

grant update on table "public"."containers" to "service_role";

grant delete on table "public"."organisation_link" to "anon";

grant insert on table "public"."organisation_link" to "anon";

grant references on table "public"."organisation_link" to "anon";

grant trigger on table "public"."organisation_link" to "anon";

grant truncate on table "public"."organisation_link" to "anon";

grant update on table "public"."organisation_link" to "anon";

grant delete on table "public"."organisation_link" to "authenticated";

grant insert on table "public"."organisation_link" to "authenticated";

grant references on table "public"."organisation_link" to "authenticated";

grant select on table "public"."organisation_link" to "authenticated";

grant trigger on table "public"."organisation_link" to "authenticated";

grant truncate on table "public"."organisation_link" to "authenticated";

grant update on table "public"."organisation_link" to "authenticated";

grant select on table "public"."organisation_link" to "powersync_role";

grant delete on table "public"."organisation_link" to "service_role";

grant insert on table "public"."organisation_link" to "service_role";

grant references on table "public"."organisation_link" to "service_role";

grant select on table "public"."organisation_link" to "service_role";

grant trigger on table "public"."organisation_link" to "service_role";

grant truncate on table "public"."organisation_link" to "service_role";

grant update on table "public"."organisation_link" to "service_role";

grant delete on table "public"."organisation_link_request" to "anon";

grant insert on table "public"."organisation_link_request" to "anon";

grant references on table "public"."organisation_link_request" to "anon";

grant trigger on table "public"."organisation_link_request" to "anon";

grant truncate on table "public"."organisation_link_request" to "anon";

grant update on table "public"."organisation_link_request" to "anon";

grant delete on table "public"."organisation_link_request" to "authenticated";

grant insert on table "public"."organisation_link_request" to "authenticated";

grant references on table "public"."organisation_link_request" to "authenticated";

grant select on table "public"."organisation_link_request" to "authenticated";

grant trigger on table "public"."organisation_link_request" to "authenticated";

grant truncate on table "public"."organisation_link_request" to "authenticated";

grant update on table "public"."organisation_link_request" to "authenticated";

grant select on table "public"."organisation_link_request" to "powersync_role";

grant delete on table "public"."organisation_link_request" to "service_role";

grant insert on table "public"."organisation_link_request" to "service_role";

grant references on table "public"."organisation_link_request" to "service_role";

grant select on table "public"."organisation_link_request" to "service_role";

grant trigger on table "public"."organisation_link_request" to "service_role";

grant truncate on table "public"."organisation_link_request" to "service_role";

grant update on table "public"."organisation_link_request" to "service_role";

grant select on table "public"."seed_transfer_event" to "authenticated";

grant select on table "public"."seed_transfer_event" to "powersync_role";

grant delete on table "public"."seed_transfer_event" to "service_role";

grant insert on table "public"."seed_transfer_event" to "service_role";

grant references on table "public"."seed_transfer_event" to "service_role";

grant select on table "public"."seed_transfer_event" to "service_role";

grant trigger on table "public"."seed_transfer_event" to "service_role";

grant truncate on table "public"."seed_transfer_event" to "service_role";

grant update on table "public"."seed_transfer_event" to "service_role";

grant select on table "public"."seed_transfer_item" to "authenticated";

grant select on table "public"."seed_transfer_item" to "powersync_role";

grant delete on table "public"."seed_transfer_item" to "service_role";

grant insert on table "public"."seed_transfer_item" to "service_role";

grant references on table "public"."seed_transfer_item" to "service_role";

grant select on table "public"."seed_transfer_item" to "service_role";

grant trigger on table "public"."seed_transfer_item" to "service_role";

grant truncate on table "public"."seed_transfer_item" to "service_role";

grant update on table "public"."seed_transfer_item" to "service_role";

grant delete on table "public"."storage_locations" to "anon";

grant insert on table "public"."storage_locations" to "anon";

grant references on table "public"."storage_locations" to "anon";

grant trigger on table "public"."storage_locations" to "anon";

grant truncate on table "public"."storage_locations" to "anon";

grant update on table "public"."storage_locations" to "anon";

grant delete on table "public"."storage_locations" to "authenticated";

grant insert on table "public"."storage_locations" to "authenticated";

grant references on table "public"."storage_locations" to "authenticated";

grant select on table "public"."storage_locations" to "authenticated";

grant trigger on table "public"."storage_locations" to "authenticated";

grant truncate on table "public"."storage_locations" to "authenticated";

grant update on table "public"."storage_locations" to "authenticated";

grant select on table "public"."storage_locations" to "powersync_role";

grant delete on table "public"."storage_locations" to "service_role";

grant insert on table "public"."storage_locations" to "service_role";

grant references on table "public"."storage_locations" to "service_role";

grant select on table "public"."storage_locations" to "service_role";

grant trigger on table "public"."storage_locations" to "service_role";

grant truncate on table "public"."storage_locations" to "service_role";

grant update on table "public"."storage_locations" to "service_role";

grant delete on table "public"."sub_batch_lineage" to "anon";

grant insert on table "public"."sub_batch_lineage" to "anon";

grant references on table "public"."sub_batch_lineage" to "anon";

grant trigger on table "public"."sub_batch_lineage" to "anon";

grant truncate on table "public"."sub_batch_lineage" to "anon";

grant update on table "public"."sub_batch_lineage" to "anon";

grant references on table "public"."sub_batch_lineage" to "authenticated";

grant select on table "public"."sub_batch_lineage" to "authenticated";

grant trigger on table "public"."sub_batch_lineage" to "authenticated";

grant select on table "public"."sub_batch_lineage" to "powersync_role";

grant delete on table "public"."sub_batch_lineage" to "service_role";

grant insert on table "public"."sub_batch_lineage" to "service_role";

grant references on table "public"."sub_batch_lineage" to "service_role";

grant select on table "public"."sub_batch_lineage" to "service_role";

grant trigger on table "public"."sub_batch_lineage" to "service_role";

grant truncate on table "public"."sub_batch_lineage" to "service_role";

grant update on table "public"."sub_batch_lineage" to "service_role";

grant delete on table "public"."sub_batches" to "anon";

grant insert on table "public"."sub_batches" to "anon";

grant references on table "public"."sub_batches" to "anon";

grant trigger on table "public"."sub_batches" to "anon";

grant truncate on table "public"."sub_batches" to "anon";

grant update on table "public"."sub_batches" to "anon";

grant delete on table "public"."sub_batches" to "authenticated";

grant insert on table "public"."sub_batches" to "authenticated";

grant references on table "public"."sub_batches" to "authenticated";

grant select on table "public"."sub_batches" to "authenticated";

grant trigger on table "public"."sub_batches" to "authenticated";

grant truncate on table "public"."sub_batches" to "authenticated";

grant select on table "public"."sub_batches" to "powersync_role";

grant delete on table "public"."sub_batches" to "service_role";

grant insert on table "public"."sub_batches" to "service_role";

grant references on table "public"."sub_batches" to "service_role";

grant select on table "public"."sub_batches" to "service_role";

grant trigger on table "public"."sub_batches" to "service_role";

grant truncate on table "public"."sub_batches" to "service_role";

grant update on table "public"."sub_batches" to "service_role";

grant delete on table "public"."tests" to "anon";

grant insert on table "public"."tests" to "anon";

grant references on table "public"."tests" to "anon";

grant trigger on table "public"."tests" to "anon";

grant truncate on table "public"."tests" to "anon";

grant update on table "public"."tests" to "anon";

grant delete on table "public"."tests" to "authenticated";

grant insert on table "public"."tests" to "authenticated";

grant references on table "public"."tests" to "authenticated";

grant select on table "public"."tests" to "authenticated";

grant trigger on table "public"."tests" to "authenticated";

grant truncate on table "public"."tests" to "authenticated";

grant update on table "public"."tests" to "authenticated";

grant select on table "public"."tests" to "powersync_role";

grant delete on table "public"."tests" to "service_role";

grant insert on table "public"."tests" to "service_role";

grant references on table "public"."tests" to "service_role";

grant select on table "public"."tests" to "service_role";

grant trigger on table "public"."tests" to "service_role";

grant truncate on table "public"."tests" to "service_role";

grant update on table "public"."tests" to "service_role";

grant delete on table "public"."treatments" to "anon";

grant insert on table "public"."treatments" to "anon";

grant references on table "public"."treatments" to "anon";

grant trigger on table "public"."treatments" to "anon";

grant truncate on table "public"."treatments" to "anon";

grant update on table "public"."treatments" to "anon";

grant delete on table "public"."treatments" to "authenticated";

grant insert on table "public"."treatments" to "authenticated";

grant references on table "public"."treatments" to "authenticated";

grant select on table "public"."treatments" to "authenticated";

grant trigger on table "public"."treatments" to "authenticated";

grant truncate on table "public"."treatments" to "authenticated";

grant update on table "public"."treatments" to "authenticated";

grant select on table "public"."treatments" to "powersync_role";

grant delete on table "public"."treatments" to "service_role";

grant insert on table "public"."treatments" to "service_role";

grant references on table "public"."treatments" to "service_role";

grant select on table "public"."treatments" to "service_role";

grant trigger on table "public"."treatments" to "service_role";

grant truncate on table "public"."treatments" to "service_role";

grant update on table "public"."treatments" to "service_role";


  create policy "batch_cleaning_insert"
  on "public"."batch_cleaning"
  as permissive
  for insert
  to authenticated
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "batch_cleaning_permission_delete"
  on "public"."batch_cleaning"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_permission_insert"
  on "public"."batch_cleaning"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_permission_update"
  on "public"."batch_cleaning"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_select"
  on "public"."batch_cleaning"
  as permissive
  for select
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "batch_cleaning_output_insert"
  on "public"."batch_cleaning_output"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.batch_cleaning bc
  WHERE ((bc.id = batch_cleaning_output.cleaning_id) AND (bc.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "batch_cleaning_output_permission_delete"
  on "public"."batch_cleaning_output"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_output_permission_insert"
  on "public"."batch_cleaning_output"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_output_permission_update"
  on "public"."batch_cleaning_output"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_output_select"
  on "public"."batch_cleaning_output"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.batch_cleaning bc
  WHERE ((bc.id = batch_cleaning_output.cleaning_id) AND (bc.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "batch_cleaning_photo_delete"
  on "public"."batch_cleaning_photo"
  as permissive
  for delete
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "batch_cleaning_photo_insert"
  on "public"."batch_cleaning_photo"
  as permissive
  for insert
  to authenticated
with check (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (EXISTS ( SELECT 1
   FROM public.batch_cleaning bc
  WHERE ((bc.id = batch_cleaning_photo.cleaning_id) AND (bc.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))))));



  create policy "batch_cleaning_photo_permission_delete"
  on "public"."batch_cleaning_photo"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_photo_permission_insert"
  on "public"."batch_cleaning_photo"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_photo_permission_update"
  on "public"."batch_cleaning_photo"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_cleaning_photo_select"
  on "public"."batch_cleaning_photo"
  as permissive
  for select
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "batch_cleaning_photo_update"
  on "public"."batch_cleaning_photo"
  as permissive
  for update
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "batch_custody_permission_delete"
  on "public"."batch_custody"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_custody_permission_insert"
  on "public"."batch_custody"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_custody_permission_update"
  on "public"."batch_custody"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_custody_select"
  on "public"."batch_custody"
  as permissive
  for select
  to authenticated
using ((public.is_batch_owner(batch_id) OR public.is_current_custodian(( SELECT auth.uid() AS uid), batch_id)));



  create policy "batch_merges_delete"
  on "public"."batch_merges"
  as permissive
  for delete
  to authenticated
using (public.is_current_custodian(( SELECT auth.uid() AS uid), merged_batch_id));



  create policy "batch_merges_permission_delete"
  on "public"."batch_merges"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_merges_permission_insert"
  on "public"."batch_merges"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_merges_permission_update"
  on "public"."batch_merges"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_merges_select"
  on "public"."batch_merges"
  as permissive
  for select
  to authenticated
using (public.is_current_custodian(( SELECT auth.uid() AS uid), merged_batch_id));



  create policy "batch_merges_update"
  on "public"."batch_merges"
  as permissive
  for update
  to authenticated
using (public.is_current_custodian(( SELECT auth.uid() AS uid), merged_batch_id))
with check (public.is_current_custodian(( SELECT auth.uid() AS uid), merged_batch_id));



  create policy "batch_splits_delete"
  on "public"."batch_splits"
  as permissive
  for delete
  to authenticated
using (public.is_current_custodian(( SELECT auth.uid() AS uid), parent_batch_id));



  create policy "batch_splits_permission_delete"
  on "public"."batch_splits"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_splits_permission_insert"
  on "public"."batch_splits"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_splits_permission_update"
  on "public"."batch_splits"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_splits_select"
  on "public"."batch_splits"
  as permissive
  for select
  to authenticated
using (public.is_current_custodian(( SELECT auth.uid() AS uid), parent_batch_id));



  create policy "batch_splits_update"
  on "public"."batch_splits"
  as permissive
  for update
  to authenticated
using (public.is_current_custodian(( SELECT auth.uid() AS uid), parent_batch_id))
with check (public.is_current_custodian(( SELECT auth.uid() AS uid), parent_batch_id));



  create policy "batch_storage_insert"
  on "public"."batch_storage"
  as permissive
  for insert
  to authenticated
with check (public.is_current_bag_custodian(( SELECT auth.uid() AS uid), sub_batch_id));



  create policy "batch_storage_permission_delete"
  on "public"."batch_storage"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_storage_permission_insert"
  on "public"."batch_storage"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_storage_permission_update"
  on "public"."batch_storage"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_storage_select"
  on "public"."batch_storage"
  as permissive
  for select
  to authenticated
using (public.can_read_sub_batch(sub_batch_id));



  create policy "batch_storage_update"
  on "public"."batch_storage"
  as permissive
  for update
  to authenticated
using (public.is_current_bag_custodian(( SELECT auth.uid() AS uid), sub_batch_id))
with check (public.is_current_bag_custodian(( SELECT auth.uid() AS uid), sub_batch_id));



  create policy "batch_testing_assignment_permission_delete"
  on "public"."batch_testing_assignment"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_testing_assignment_permission_insert"
  on "public"."batch_testing_assignment"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_testing_assignment_permission_update"
  on "public"."batch_testing_assignment"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_testing_assignment_select"
  on "public"."batch_testing_assignment"
  as permissive
  for select
  to authenticated
using ((public.is_org_member(( SELECT auth.uid() AS uid), assigned_by_org_id) OR public.is_org_member(( SELECT auth.uid() AS uid), assigned_to_org_id)));



  create policy "batch_testing_assignment_return_item_select_participant"
  on "public"."batch_testing_assignment_return_item"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.batch_testing_assignment assignment
  WHERE ((assignment.id = batch_testing_assignment_return_item.assignment_id) AND ((public.get_user_organisation_id() = assignment.assigned_by_org_id) OR (public.get_user_organisation_id() = assignment.assigned_to_org_id))))));



  create policy "batch_testing_assignment_status_audit_select_participant"
  on "public"."batch_testing_assignment_status_audit"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.batch_testing_assignment assignment
  WHERE ((assignment.id = batch_testing_assignment_status_audit.assignment_id) AND ((public.get_user_organisation_id() = assignment.assigned_by_org_id) OR (public.get_user_organisation_id() = assignment.assigned_to_org_id))))));



  create policy "batch_weight_adjustments_insert"
  on "public"."batch_weight_adjustments"
  as permissive
  for insert
  to authenticated
with check (public.is_current_bag_custodian(( SELECT auth.uid() AS uid), sub_batch_id));



  create policy "batch_weight_adjustments_permission_delete"
  on "public"."batch_weight_adjustments"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batch_weight_adjustments_permission_insert"
  on "public"."batch_weight_adjustments"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batch_weight_adjustments_permission_update"
  on "public"."batch_weight_adjustments"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batch_weight_adjustments_select"
  on "public"."batch_weight_adjustments"
  as permissive
  for select
  to authenticated
using (public.can_read_sub_batch(sub_batch_id));



  create policy "batches_delete"
  on "public"."batches"
  as permissive
  for delete
  to authenticated
using ((public.is_current_custodian(( SELECT auth.uid() AS uid), id) AND (NOT public.batch_has_externally_held_bags(id))));



  create policy "batches_permission_delete"
  on "public"."batches"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "batches_permission_insert"
  on "public"."batches"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "batches_permission_update"
  on "public"."batches"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "batches_select"
  on "public"."batches"
  as permissive
  for select
  to authenticated
using (public.can_read_batch(id));



  create policy "batches_update"
  on "public"."batches"
  as permissive
  for update
  to authenticated
using (public.is_current_custodian(( SELECT auth.uid() AS uid), id));



  create policy "collection_delete"
  on "public"."collection"
  as permissive
  for delete
  to authenticated
using (((created_by = ( SELECT auth.uid() AS uid)) OR ((( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text) AND (organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))));



  create policy "collection_insert"
  on "public"."collection"
  as permissive
  for insert
  to authenticated
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "collection_permission_delete"
  on "public"."collection"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "collection_permission_insert"
  on "public"."collection"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "collection_permission_update"
  on "public"."collection"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "collection_select"
  on "public"."collection"
  as permissive
  for select
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) OR (EXISTS ( SELECT 1
   FROM public.batches b
  WHERE ((b.collection_id = collection.id) AND public.holds_any_bag_of_batch(b.id))))));



  create policy "collection_update"
  on "public"."collection"
  as permissive
  for update
  to authenticated
using (((created_by = ( SELECT auth.uid() AS uid)) OR ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text))))
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "collection_audio_permission_delete"
  on "public"."collection_audio"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "collection_audio_permission_insert"
  on "public"."collection_audio"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "collection_audio_permission_update"
  on "public"."collection_audio"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "collection_containers_delete"
  on "public"."collection_containers"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_containers.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND ((c.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text))))));



  create policy "collection_containers_insert"
  on "public"."collection_containers"
  as permissive
  for insert
  to authenticated
with check (((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_containers.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))) AND (EXISTS ( SELECT 1
   FROM public.containers ct
  WHERE ((ct.id = collection_containers.container_id) AND (ct.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))))));



  create policy "collection_containers_permission_delete"
  on "public"."collection_containers"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "collection_containers_permission_insert"
  on "public"."collection_containers"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "collection_containers_permission_update"
  on "public"."collection_containers"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "collection_containers_select"
  on "public"."collection_containers"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_containers.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "collection_containers_update"
  on "public"."collection_containers"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_containers.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND ((c.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text))))))
with check (((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_containers.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))) AND (EXISTS ( SELECT 1
   FROM public.containers ct
  WHERE ((ct.id = collection_containers.container_id) AND (ct.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))))));



  create policy "collection_photo_delete"
  on "public"."collection_photo"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_photo.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND ((c.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text))))));



  create policy "collection_photo_insert"
  on "public"."collection_photo"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_photo.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "collection_photo_permission_delete"
  on "public"."collection_photo"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "collection_photo_permission_insert"
  on "public"."collection_photo"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "collection_photo_permission_update"
  on "public"."collection_photo"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "collection_photo_select"
  on "public"."collection_photo"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_photo.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "collection_photo_update"
  on "public"."collection_photo"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.collection c
  WHERE ((c.id = collection_photo.collection_id) AND (c.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND ((c.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text))))));



  create policy "containers_delete"
  on "public"."containers"
  as permissive
  for delete
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "containers_insert"
  on "public"."containers"
  as permissive
  for insert
  to authenticated
with check (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "containers_permission_delete"
  on "public"."containers"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "containers_permission_insert"
  on "public"."containers"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "containers_permission_update"
  on "public"."containers"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "containers_select"
  on "public"."containers"
  as permissive
  for select
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) OR (EXISTS ( SELECT 1
   FROM public.sub_batches sb
  WHERE ((sb.container_id = containers.id) AND public.can_read_sub_batch(sb.id))))));



  create policy "containers_update"
  on "public"."containers"
  as permissive
  for update
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)))
with check (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "invitation_delete"
  on "public"."invitation"
  as permissive
  for delete
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "invitation_select"
  on "public"."invitation"
  as permissive
  for select
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "invitation_update"
  on "public"."invitation"
  as permissive
  for update
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)))
with check (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "org_user_select"
  on "public"."org_user"
  as permissive
  for select
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) OR (user_id = ( SELECT auth.uid() AS uid))));



  create policy "organisation_select"
  on "public"."organisation"
  as permissive
  for select
  to authenticated
using (((id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) OR is_testing_provider OR (EXISTS ( SELECT 1
   FROM (public.organisation_link ol
     JOIN public.org_user ou ON ((ou.organisation_id = ol.provider_org_id)))
  WHERE ((ol.requesting_org_id = organisation.id) AND (ou.user_id = ( SELECT auth.uid() AS uid)))))));



  create policy "organisation_update"
  on "public"."organisation"
  as permissive
  for update
  to authenticated
using (((id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)))
with check (((id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "organisation_link_delete"
  on "public"."organisation_link"
  as permissive
  for delete
  to authenticated
using ((public.is_org_member(( SELECT auth.uid() AS uid), requesting_org_id) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "organisation_link_insert"
  on "public"."organisation_link"
  as permissive
  for insert
  to authenticated
with check ((public.is_org_member(( SELECT auth.uid() AS uid), provider_org_id) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "organisation_link_select"
  on "public"."organisation_link"
  as permissive
  for select
  to authenticated
using ((public.is_org_member(( SELECT auth.uid() AS uid), requesting_org_id) OR public.is_org_member(( SELECT auth.uid() AS uid), provider_org_id)));



  create policy "organisation_link_update"
  on "public"."organisation_link"
  as permissive
  for update
  to authenticated
using ((public.is_org_member(( SELECT auth.uid() AS uid), requesting_org_id) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)))
with check ((public.is_org_member(( SELECT auth.uid() AS uid), requesting_org_id) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "organisation_link_request_delete"
  on "public"."organisation_link_request"
  as permissive
  for delete
  to authenticated
using ((public.is_org_member(( SELECT auth.uid() AS uid), requesting_org_id) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "organisation_link_request_insert"
  on "public"."organisation_link_request"
  as permissive
  for insert
  to authenticated
with check ((public.is_org_member(( SELECT auth.uid() AS uid), requesting_org_id) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "organisation_link_request_select"
  on "public"."organisation_link_request"
  as permissive
  for select
  to authenticated
using ((public.is_org_member(( SELECT auth.uid() AS uid), requesting_org_id) OR public.is_org_member(( SELECT auth.uid() AS uid), provider_org_id)));



  create policy "organisation_link_request_update"
  on "public"."organisation_link_request"
  as permissive
  for update
  to authenticated
using ((public.is_org_member(( SELECT auth.uid() AS uid), provider_org_id) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)))
with check ((public.is_org_member(( SELECT auth.uid() AS uid), provider_org_id) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "scouting_notes_delete"
  on "public"."scouting_notes"
  as permissive
  for delete
  to authenticated
using (((created_by = ( SELECT auth.uid() AS uid)) OR ((( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text) AND (organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))));



  create policy "scouting_notes_insert"
  on "public"."scouting_notes"
  as permissive
  for insert
  to authenticated
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "scouting_notes_permission_delete"
  on "public"."scouting_notes"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "scouting_notes_permission_insert"
  on "public"."scouting_notes"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "scouting_notes_permission_update"
  on "public"."scouting_notes"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "scouting_notes_select"
  on "public"."scouting_notes"
  as permissive
  for select
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "scouting_notes_update"
  on "public"."scouting_notes"
  as permissive
  for update
  to authenticated
using (((created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)))
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "scouting_notes_audio_permission_delete"
  on "public"."scouting_notes_audio"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "scouting_notes_audio_permission_insert"
  on "public"."scouting_notes_audio"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "scouting_notes_audio_permission_update"
  on "public"."scouting_notes_audio"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "scouting_notes_photos_delete"
  on "public"."scouting_notes_photos"
  as permissive
  for delete
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.scouting_notes sn
  WHERE ((sn.id = scouting_notes_photos.scouting_notes_id) AND (sn.created_by = ( SELECT auth.uid() AS uid))))) OR ((( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text) AND (EXISTS ( SELECT 1
   FROM (public.scouting_notes sn
     JOIN public.trip t ON ((sn.trip_id = t.id)))
  WHERE ((sn.id = scouting_notes_photos.scouting_notes_id) AND (t.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))))));



  create policy "scouting_notes_photos_insert"
  on "public"."scouting_notes_photos"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM (public.scouting_notes sn
     JOIN public.trip t ON ((sn.trip_id = t.id)))
  WHERE ((sn.id = scouting_notes_photos.scouting_notes_id) AND (t.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "scouting_notes_photos_permission_delete"
  on "public"."scouting_notes_photos"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "scouting_notes_photos_permission_insert"
  on "public"."scouting_notes_photos"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "scouting_notes_photos_permission_update"
  on "public"."scouting_notes_photos"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "scouting_notes_photos_select"
  on "public"."scouting_notes_photos"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public.scouting_notes sn
     JOIN public.trip t ON ((sn.trip_id = t.id)))
  WHERE ((sn.id = scouting_notes_photos.scouting_notes_id) AND (t.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "scouting_notes_photos_update"
  on "public"."scouting_notes_photos"
  as permissive
  for update
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.scouting_notes sn
  WHERE ((sn.id = scouting_notes_photos.scouting_notes_id) AND (sn.created_by = ( SELECT auth.uid() AS uid))))) OR (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)))
with check ((EXISTS ( SELECT 1
   FROM (public.scouting_notes sn
     JOIN public.trip t ON ((sn.trip_id = t.id)))
  WHERE ((sn.id = scouting_notes_photos.scouting_notes_id) AND (t.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "seed_transfer_event_select"
  on "public"."seed_transfer_event"
  as permissive
  for select
  to authenticated
using (((sender_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) OR (recipient_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))));



  create policy "seed_transfer_item_select"
  on "public"."seed_transfer_item"
  as permissive
  for select
  to authenticated
using (((owner_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) OR (EXISTS ( SELECT 1
   FROM public.seed_transfer_event ste
  WHERE ((ste.id = seed_transfer_item.transfer_event_id) AND ((ste.sender_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) OR (ste.recipient_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))))));



  create policy "species_delete"
  on "public"."species"
  as permissive
  for delete
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "species_insert"
  on "public"."species"
  as permissive
  for insert
  to authenticated
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "species_select"
  on "public"."species"
  as permissive
  for select
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) OR (EXISTS ( SELECT 1
   FROM (public.collection c
     JOIN public.batches b ON ((b.collection_id = c.id)))
  WHERE ((c.species_id = species.id) AND public.holds_any_bag_of_batch(b.id))))));



  create policy "species_update"
  on "public"."species"
  as permissive
  for update
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "species_photo_delete"
  on "public"."species_photo"
  as permissive
  for delete
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "species_photo_insert"
  on "public"."species_photo"
  as permissive
  for insert
  to authenticated
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "species_photo_select"
  on "public"."species_photo"
  as permissive
  for select
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "species_photo_update"
  on "public"."species_photo"
  as permissive
  for update
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "storage_locations_insert"
  on "public"."storage_locations"
  as permissive
  for insert
  to authenticated
with check (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "storage_locations_permission_delete"
  on "public"."storage_locations"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "storage_locations_permission_insert"
  on "public"."storage_locations"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "storage_locations_permission_update"
  on "public"."storage_locations"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "storage_locations_select"
  on "public"."storage_locations"
  as permissive
  for select
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "storage_locations_update"
  on "public"."storage_locations"
  as permissive
  for update
  to authenticated
using (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)))
with check (((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (( SELECT public.auth_org_role() AS auth_org_role) = 'Admin'::text)));



  create policy "sub_batch_lineage_select_participant"
  on "public"."sub_batch_lineage"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public.sub_batches bag
     JOIN public.batches batch ON ((batch.id = bag.batch_id)))
  WHERE ((bag.id = ANY (ARRAY[sub_batch_lineage.source_sub_batch_id, sub_batch_lineage.derived_sub_batch_id])) AND ((batch.organisation_id = public.get_user_organisation_id()) OR (bag.held_by_org_id = public.get_user_organisation_id()))))));



  create policy "sub_batches_delete"
  on "public"."sub_batches"
  as permissive
  for delete
  to authenticated
using (public.is_current_bag_custodian(( SELECT auth.uid() AS uid), id));



  create policy "sub_batches_insert"
  on "public"."sub_batches"
  as permissive
  for insert
  to authenticated
with check ((held_by_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "sub_batches_permission_delete"
  on "public"."sub_batches"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "sub_batches_permission_insert"
  on "public"."sub_batches"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "sub_batches_permission_update"
  on "public"."sub_batches"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "sub_batches_select"
  on "public"."sub_batches"
  as permissive
  for select
  to authenticated
using (public.can_read_sub_batch(id));



  create policy "sub_batches_update"
  on "public"."sub_batches"
  as permissive
  for update
  to authenticated
using (public.is_current_bag_custodian(( SELECT auth.uid() AS uid), id))
with check ((held_by_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "tests_delete"
  on "public"."tests"
  as permissive
  for delete
  to authenticated
using (((performed_by_organisation_id IS NOT NULL) AND (performed_by_organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))));



  create policy "tests_permission_delete"
  on "public"."tests"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "tests_permission_insert"
  on "public"."tests"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "tests_permission_update"
  on "public"."tests"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "tests_select"
  on "public"."tests"
  as permissive
  for select
  to authenticated
using ((public.can_read_sub_batch(sub_batch_id) OR ((performed_by_organisation_id IS NOT NULL) AND (performed_by_organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))));



  create policy "tests_update"
  on "public"."tests"
  as permissive
  for update
  to authenticated
using (((performed_by_organisation_id IS NOT NULL) AND (performed_by_organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))
with check (((performed_by_organisation_id IS NOT NULL) AND (performed_by_organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))));



  create policy "treatments_permission_delete"
  on "public"."treatments"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('inventory'::text));



  create policy "treatments_permission_insert"
  on "public"."treatments"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('inventory'::text));



  create policy "treatments_permission_update"
  on "public"."treatments"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('inventory'::text))
with check (public.has_org_permission('inventory'::text));



  create policy "treatments_select"
  on "public"."treatments"
  as permissive
  for select
  to authenticated
using (public.is_current_custodian(( SELECT auth.uid() AS uid), input_batch_id));



  create policy "trip_all"
  on "public"."trip"
  as permissive
  for all
  to authenticated
using ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))
with check ((organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)));



  create policy "trip_permission_delete"
  on "public"."trip"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "trip_permission_insert"
  on "public"."trip"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "trip_permission_update"
  on "public"."trip"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "trip_member_all"
  on "public"."trip_member"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.trip t
  WHERE ((t.id = trip_member.trip_id) AND (t.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))))
with check ((EXISTS ( SELECT 1
   FROM public.trip t
  WHERE ((t.id = trip_member.trip_id) AND (t.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "trip_member_permission_delete"
  on "public"."trip_member"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "trip_member_permission_insert"
  on "public"."trip_member"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "trip_member_permission_update"
  on "public"."trip_member"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));



  create policy "trip_species_all"
  on "public"."trip_species"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.trip t
  WHERE ((t.id = trip_species.trip_id) AND (t.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))))
with check ((EXISTS ( SELECT 1
   FROM public.trip t
  WHERE ((t.id = trip_species.trip_id) AND (t.organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))))));



  create policy "trip_species_permission_delete"
  on "public"."trip_species"
  as restrictive
  for delete
  to authenticated
using (public.has_org_permission('collections'::text));



  create policy "trip_species_permission_insert"
  on "public"."trip_species"
  as restrictive
  for insert
  to authenticated
with check (public.has_org_permission('collections'::text));



  create policy "trip_species_permission_update"
  on "public"."trip_species"
  as restrictive
  for update
  to authenticated
using (public.has_org_permission('collections'::text))
with check (public.has_org_permission('collections'::text));


CREATE TRIGGER batch_cleaning_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_cleaning FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batch_cleaning_validate_worker_ids BEFORE INSERT OR UPDATE OF worker_ids, organisation_id ON public.batch_cleaning FOR EACH ROW EXECUTE FUNCTION public.validate_batch_cleaning_worker_ids();

CREATE TRIGGER batch_cleaning_output_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_cleaning_output FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batch_cleaning_photo_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_cleaning_photo FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batch_custody_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_custody FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batch_merges_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_merges FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batch_splits_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_splits FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batch_storage_active_location BEFORE INSERT OR UPDATE OF location_id, batch_id, sub_batch_id ON public.batch_storage FOR EACH ROW EXECUTE FUNCTION public.validate_active_storage_location();

CREATE TRIGGER batch_storage_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_storage FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batch_testing_assignment_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_testing_assignment FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batch_testing_assignment_return_item_append_only BEFORE DELETE OR UPDATE ON public.batch_testing_assignment_return_item FOR EACH ROW EXECUTE FUNCTION public.reject_seed_transfer_mutation();

CREATE TRIGGER batch_testing_assignment_status_audit_reject_rewrite BEFORE DELETE OR UPDATE ON public.batch_testing_assignment_status_audit FOR EACH ROW EXECUTE FUNCTION public.reject_testing_assignment_status_audit_rewrite();

CREATE TRIGGER batch_weight_adjustments_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batch_weight_adjustments FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER batches_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.batches FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER collection_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.collection FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER trg_create_origin_batch_for_collection AFTER INSERT ON public.collection FOR EACH ROW EXECUTE FUNCTION public.fn_create_origin_batch_for_collection();

CREATE TRIGGER collection_audio_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.collection_audio FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER collection_containers_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.collection_containers FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER collection_photo_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.collection_photo FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER containers_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.containers FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER containers_purpose_immutable BEFORE UPDATE OF purpose ON public.containers FOR EACH ROW WHEN ((old.purpose IS DISTINCT FROM new.purpose)) EXECUTE FUNCTION public.prevent_container_purpose_change();

CREATE TRIGGER organisation_link_validate_provider BEFORE INSERT OR UPDATE OF provider_org_id ON public.organisation_link FOR EACH ROW EXECUTE FUNCTION public.validate_testing_provider_link();

CREATE TRIGGER organisation_link_request_validate_provider BEFORE INSERT OR UPDATE OF provider_org_id ON public.organisation_link_request FOR EACH ROW EXECUTE FUNCTION public.validate_testing_provider_link();

CREATE TRIGGER scouting_notes_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.scouting_notes FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER scouting_notes_audio_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.scouting_notes_audio FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER scouting_notes_photos_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.scouting_notes_photos FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER seed_transfer_event_append_only BEFORE DELETE OR UPDATE ON public.seed_transfer_event FOR EACH ROW EXECUTE FUNCTION public.reject_seed_transfer_mutation();

CREATE TRIGGER seed_transfer_item_append_only BEFORE DELETE OR UPDATE ON public.seed_transfer_item FOR EACH ROW EXECUTE FUNCTION public.reject_seed_transfer_mutation();

CREATE TRIGGER seed_transfer_item_validate BEFORE INSERT ON public.seed_transfer_item FOR EACH ROW EXECUTE FUNCTION public.validate_seed_transfer_item();

CREATE TRIGGER storage_locations_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.storage_locations FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER sub_batch_lineage_reject_rewrite BEFORE DELETE OR UPDATE ON public.sub_batch_lineage FOR EACH ROW EXECUTE FUNCTION public.reject_sub_batch_lineage_rewrite();

CREATE TRIGGER sub_batch_lineage_validate_edge BEFORE INSERT ON public.sub_batch_lineage FOR EACH ROW EXECUTE FUNCTION public.validate_sub_batch_lineage_edge();

CREATE TRIGGER sub_batches_default_held_by BEFORE INSERT ON public.sub_batches FOR EACH ROW EXECUTE FUNCTION public.fn_default_sub_batch_holder();
ALTER TABLE "public"."sub_batches" ENABLE ALWAYS TRIGGER "sub_batches_default_held_by";

CREATE TRIGGER sub_batches_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.sub_batches FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER sub_batches_storage_container_relationship BEFORE INSERT OR UPDATE OF container_id, batch_id ON public.sub_batches FOR EACH ROW EXECUTE FUNCTION public.validate_sub_batch_storage_container();

CREATE TRIGGER tests_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tests FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER trigger_update_quality_test_statistics AFTER INSERT OR UPDATE OF result ON public.tests FOR EACH ROW EXECUTE FUNCTION public.update_quality_test_statistics();

CREATE TRIGGER treatments_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.treatments FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('inventory');

CREATE TRIGGER trip_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.trip FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER trip_member_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.trip_member FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');

CREATE TRIGGER trip_species_permission_guard BEFORE INSERT OR DELETE OR UPDATE ON public.trip_species FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission('collections');


  create policy "allow_org_access_batch_cleaning_photos_bucket"
  on "storage"."objects"
  as permissive
  for all
  to authenticated
using (((bucket_id = 'batch-cleaning-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT public.get_user_organisation_id() AS get_user_organisation_id))::text)))
with check (((bucket_id = 'batch-cleaning-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT public.get_user_organisation_id() AS get_user_organisation_id))::text)));




