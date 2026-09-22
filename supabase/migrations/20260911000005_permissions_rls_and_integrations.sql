-- Permissions, RLS, and integrations
--
-- Final authentication helpers, grants, policies, mutation guards,
-- storage configuration, and PowerSync-facing access.

set check_function_bodies = off;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'custom_access_token_hook'
  ) THEN
    EXECUTE 'alter function public.custom_access_token_hook(jsonb) owner to postgres';
  END IF;
END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'batch-cleaning-photos',
  'batch-cleaning-photos',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp']
);

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

alter table "public"."batch_cleaning" enable row level security;

alter table "public"."batch_cleaning_output" enable row level security;

alter table "public"."batch_cleaning_photo" enable row level security;

alter table "public"."batch_custody" enable row level security;

alter table "public"."batch_merges" enable row level security;

alter table "public"."batch_splits" enable row level security;

alter table "public"."batch_storage" enable row level security;

alter table "public"."batch_testing_assignment" enable row level security;

alter table "public"."batch_testing_assignment_return_item" enable row level security;

alter table "public"."batch_testing_assignment_status_audit" enable row level security;

alter table "public"."batch_weight_adjustments" enable row level security;

alter table "public"."batches" enable row level security;

alter table "public"."collection_containers" enable row level security;

alter table "public"."containers" enable row level security;

alter table "public"."organisation_link" enable row level security;

alter table "public"."organisation_link_request" enable row level security;

alter table "public"."seed_transfer_event" enable row level security;

alter table "public"."seed_transfer_item" enable row level security;

alter table "public"."storage_locations" enable row level security;

alter table "public"."sub_batch_lineage" enable row level security;

alter table "public"."sub_batches" enable row level security;

alter table "public"."tests" enable row level security;

alter table "public"."treatments" enable row level security;

alter table "public"."scouting_notes" enable row level security;

alter table "public"."scouting_notes_photos" enable row level security;

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

REVOKE SELECT ON TABLE
  public.batch_cleaning,
  public.batch_cleaning_output,
  public.batch_cleaning_photo,
  public.batch_custody,
  public.batch_merges,
  public.batch_splits,
  public.batch_storage,
  public.batch_testing_assignment,
  public.batch_testing_assignment_return_item,
  public.batch_testing_assignment_status_audit,
  public.batch_weight_adjustments,
  public.batches,
  public.collection_containers,
  public.containers,
  public.organisation_link,
  public.organisation_link_request,
  public.storage_locations,
  public.sub_batch_lineage,
  public.sub_batches,
  public.tests,
  public.treatments
FROM anon;

REVOKE DELETE, INSERT, TRUNCATE, UPDATE ON TABLE
  public.batch_testing_assignment_return_item,
  public.batch_testing_assignment_status_audit,
  public.sub_batch_lineage
FROM authenticated;

REVOKE ALL PRIVILEGES ON TABLE
  public.seed_transfer_event,
  public.seed_transfer_item
FROM anon;

REVOKE DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE
  public.seed_transfer_event,
  public.seed_transfer_item
FROM authenticated;

REVOKE UPDATE ON TABLE public.sub_batches FROM authenticated;

ALTER VIEW public.obfuscated_collection_data SET (security_invoker = true);
ALTER VIEW public.active_batches SET (security_invoker = true);
ALTER VIEW public.active_sub_batches SET (security_invoker = true);
ALTER VIEW public.current_batch_custody SET (security_invoker = true);
ALTER VIEW public.batch_current_weight SET (security_invoker = true);
ALTER VIEW public.current_batch_storage SET (security_invoker = true);
ALTER VIEW public.sub_batch_current_weight SET (security_invoker = true);
ALTER VIEW public.batch_lineage SET (security_invoker = true);
ALTER VIEW public.batch_lineage_to_collections SET (security_invoker = true);
