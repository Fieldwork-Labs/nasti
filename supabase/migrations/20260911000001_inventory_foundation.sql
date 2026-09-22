-- Inventory foundation
--
-- Final table, enum, index, and relational constraint shape for inventory,
-- testing, custody, and lineage. Behaviour is added in later migrations.

create type "public"."batch_quality" as enum ('ORG', 'HQ', 'LQ');

create type "public"."batch_treatment_type" as enum ('sort', 'coat', 'treat', 'other');

create type "public"."batch_weight_adjustment_kind" as enum ('test_consumption', 'variance', 'split', 'merge', 'cleaning', 'correction');

create type "public"."container_purpose" as enum ('collection', 'storage');

create type "public"."org_permission" as enum ('collections', 'inventory');

create type "public"."seed_transfer_event_kind" as enum ('testing_dispatch', 'return', 'reversal', 'correction');

create type "public"."sub_batch_lineage_operation_kind" as enum ('split', 'merge', 'cleaning');

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

create table "public"."batch_cleaning_output" (
    "id" uuid not null default gen_random_uuid(),
    "cleaning_id" uuid not null,
    "output_batch_id" uuid not null,
    "quality" text not null,
    "material_type" text not null,
    "weight_grams" numeric not null
      );

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

create table "public"."batch_custody" (
    "id" uuid not null default gen_random_uuid(),
    "batch_id" uuid not null,
    "organisation_id" uuid not null,
    "received_at" timestamp with time zone not null default now(),
    "transferred_by" uuid,
    "previous_organisation_id" uuid,
    "notes" text
      );

create table "public"."batch_merges" (
    "id" uuid not null default gen_random_uuid(),
    "merged_batch_id" uuid not null,
    "source_batch_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );

create table "public"."batch_splits" (
    "id" uuid not null default gen_random_uuid(),
    "parent_batch_id" uuid not null,
    "child_batch_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );

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

create table "public"."batch_testing_assignment_return_item" (
    "assignment_id" uuid not null,
    "transfer_item_id" uuid not null,
    "created_at" timestamp with time zone not null default clock_timestamp()
      );

create table "public"."batch_testing_assignment_status_audit" (
    "id" uuid not null default gen_random_uuid(),
    "assignment_id" uuid not null,
    "old_work_status" text,
    "new_work_status" text not null,
    "note" text,
    "actor_id" uuid not null,
    "recorded_at" timestamp with time zone not null default clock_timestamp()
      );

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

create table "public"."batches" (
    "id" uuid not null default gen_random_uuid(),
    "collection_id" uuid,
    "organisation_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "weight_grams" numeric,
    "notes" text,
    "code" text
      );

create table "public"."collection_containers" (
    "id" uuid not null default gen_random_uuid(),
    "collection_id" uuid not null,
    "container_id" uuid not null,
    "amount" numeric,
    "created_at" timestamp with time zone not null default now()
      );

create table "public"."containers" (
    "id" uuid not null default gen_random_uuid(),
    "organisation_id" uuid not null,
    "name" text not null,
    "purpose" public.container_purpose not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );

create table "public"."organisation_link" (
    "id" uuid not null default gen_random_uuid(),
    "requesting_org_id" uuid not null,
    "provider_org_id" uuid not null,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );

create table "public"."organisation_link_request" (
    "id" uuid not null default gen_random_uuid(),
    "requesting_org_id" uuid not null,
    "provider_org_id" uuid not null,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "accepted_by" uuid,
    "accepted_at" timestamp with time zone
      );

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

create table "public"."seed_transfer_item" (
    "id" uuid not null default gen_random_uuid(),
    "transfer_event_id" uuid not null,
    "sub_batch_id" uuid not null,
    "batch_id" uuid not null,
    "owner_org_id" uuid not null,
    "weight_grams" numeric not null
      );

create table "public"."storage_locations" (
    "id" uuid not null default gen_random_uuid(),
    "organisation_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone default now(),
    "active" boolean not null default true
      );

create table "public"."sub_batch_lineage" (
    "id" uuid not null default gen_random_uuid(),
    "source_sub_batch_id" uuid not null,
    "derived_sub_batch_id" uuid not null,
    "operation_kind" public.sub_batch_lineage_operation_kind not null,
    "operation_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid()
      );

create table "public"."sub_batches" (
    "id" uuid not null default gen_random_uuid(),
    "batch_id" uuid not null,
    "weight_grams" numeric not null,
    "notes" text,
    "created_at" timestamp with time zone default now(),
    "held_by_org_id" uuid not null,
    "container_id" uuid
      );

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

alter table "public"."invitation" add column "permissions" public.org_permission[] not null default '{}'::public.org_permission[];

alter table "public"."org_user" add column "permissions" public.org_permission[] not null default '{}'::public.org_permission[];

alter table "public"."organisation" add column "is_testing_provider" boolean not null default false;

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
