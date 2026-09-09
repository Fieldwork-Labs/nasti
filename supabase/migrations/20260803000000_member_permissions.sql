-- Granular member permissions.
--
-- Until now authorisation was a single enum: Admin or Member. Members are
-- being split into two capabilities that can be held independently:
--
--   collections — the field operators: record and edit seed collections and
--                 scouting notes, and the trips that contain them.
--   inventory   — the lab/store side: storage, cleaning, treating and testing.
--
-- Admins are unchanged: the role implies every permission, so their
-- permissions array stays empty and every check short-circuits on the role.
--
-- Enforcement happens in two places, deliberately:
--
--   1. RESTRICTIVE RLS policies on writes (INSERT/UPDATE/DELETE). Restrictive
--      policies AND with the existing permissive ones, so none of the current
--      policies need rewriting and any policy added later is covered too.
--      SELECT is intentionally left alone — inventory screens read collection
--      and trip rows, and PowerSync syncs whatever the session can read, so
--      gating reads would break cross-area work. Read-side separation is done
--      by the router guards in the apps.
--
--   2. Statement-level BEFORE triggers on the same tables. Every inventory
--      mutation of consequence goes through a SECURITY DEFINER RPC
--      (fn_clean_batch, fn_split_batch, fn_split_sub_batch, …) which bypasses RLS
--      entirely, so the policies alone would not hold. Triggers fire on the
--      table regardless of the calling function's security context, and
--      auth.jwt() is still readable inside a SECURITY DEFINER body.

-- ============================================================================
-- Permission enum and columns
-- ============================================================================
CREATE TYPE public.org_permission AS ENUM ('collections', 'inventory');

ALTER TABLE public.org_user
  ADD COLUMN permissions public.org_permission[]
    NOT NULL DEFAULT '{}'::public.org_permission[];

ALTER TABLE public.invitation
  ADD COLUMN permissions public.org_permission[]
    NOT NULL DEFAULT '{}'::public.org_permission[];

COMMENT ON COLUMN public.org_user.permissions IS
  'Areas a Member may write to. Ignored for Admins, who implicitly hold every permission.';
COMMENT ON COLUMN public.invitation.permissions IS
  'Permissions to copy onto org_user when the invitation is accepted. Ignored for Admin invitations.';

-- Existing members are field operators, so they keep collections access and
-- start without inventory. Admins grant inventory individually from People.
UPDATE public.org_user
SET permissions = ARRAY['collections']::public.org_permission[]
WHERE role = 'Member';

UPDATE public.invitation
SET permissions = ARRAY['collections']::public.org_permission[]
WHERE role = 'Member'
  AND accepted_at IS NULL;

-- ============================================================================
-- JWT claim
-- ============================================================================
-- Reclaim ownership before replacing: registering the hook reassigns the
-- function to supabase_auth_admin, and CREATE OR REPLACE requires ownership.
-- See 20260608121845_custom_access_token_hook.sql for the full rationale.
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

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Supabase access-token hook: injects org_id, org_name, role and permissions from org_user into the JWT app_metadata. Runs as security invoker (supabase_auth_admin).';

-- ============================================================================
-- Permission helpers
-- ============================================================================
-- Sessions issued before this migration have no permissions claim and would
-- otherwise lose all write access until their token refreshes (up to an hour).
-- When the claim is absent — as opposed to present but empty — fall back to
-- reading the row. SECURITY DEFINER so the fallback cannot be defeated by a
-- future policy change on org_user; the lookup is pinned to auth.uid().
CREATE OR REPLACE FUNCTION public.auth_org_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.auth_org_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_org_permissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_org_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT (SELECT public.auth_org_role()) = 'Admin'
      OR p_permission = ANY (
        COALESCE((SELECT public.auth_org_permissions()), '{}'::text[])
      )
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.has_org_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_org_permission(text) TO authenticated;

COMMENT ON FUNCTION public.has_org_permission(text) IS
  'True when the caller may write to the named area. Admins hold every permission by virtue of their role.';

-- ============================================================================
-- Write guard shared by the RLS policies and the triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_org_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
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
$$;

COMMENT ON FUNCTION public.enforce_org_permission() IS
  'Statement-level BEFORE trigger enforcing an org permission on writes, including those made through SECURITY DEFINER RPCs that bypass RLS.';

-- ============================================================================
-- Apply the gate to every table in each area
-- ============================================================================
DO $$
DECLARE
  v_area text;
  v_table text;
  v_areas jsonb := jsonb_build_object(
    'collections', jsonb_build_array(
      'trip',
      'trip_member',
      'trip_species',
      'collection',
      'collection_photo',
      'collection_audio',
      'collection_containers',
      'scouting_notes',
      'scouting_notes_photos',
      'scouting_notes_audio'
    ),
    'inventory', jsonb_build_array(
      'batches',
      'batch_custody',
      'batch_splits',
      'batch_merges',
      'batch_storage',
      'batch_weight_adjustments',
      'batch_cleaning',
      'batch_cleaning_output',
      'batch_cleaning_photo',
      'batch_testing_assignment',
      'sub_batches',
      'treatments',
      'tests',
      'storage_locations',
      'containers'
    )
  );
BEGIN
  FOR v_area IN SELECT jsonb_object_keys(v_areas) LOOP
    FOR v_table IN SELECT jsonb_array_elements_text(v_areas -> v_area) LOOP
      -- Restrictive policies: writes require the permission on top of
      -- whatever the table's permissive policies already demand.
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        v_table || '_permission_insert', v_table
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated'
        || ' WITH CHECK (public.has_org_permission(%L))',
        v_table || '_permission_insert', v_table, v_area
      );

      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        v_table || '_permission_update', v_table
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated'
        || ' USING (public.has_org_permission(%L))'
        || ' WITH CHECK (public.has_org_permission(%L))',
        v_table || '_permission_update', v_table, v_area, v_area
      );

      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        v_table || '_permission_delete', v_table
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated'
        || ' USING (public.has_org_permission(%L))',
        v_table || '_permission_delete', v_table, v_area
      );

      -- Trigger: catches the SECURITY DEFINER RPC path, which never
      -- evaluates the policies above.
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON public.%I',
        v_table || '_permission_guard', v_table
      );
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I'
        || ' FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_org_permission(%L)',
        v_table || '_permission_guard', v_table, v_area
      );
    END LOOP;
  END LOOP;
END
$$;

-- ============================================================================
-- Creating a collection provisions its origin batch
-- ============================================================================
-- The insert into batches / batch_custody here is the database's own doing,
-- not an inventory action by the user, so it opts out of the inventory guard
-- for the remainder of the transaction. Reaching this trigger at all already
-- required collections permission on the collection insert.
CREATE OR REPLACE FUNCTION public.fn_create_origin_batch_for_collection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- ============================================================================
-- Admin-only management of a member's permissions
-- ============================================================================
-- Done through an RPC rather than an UPDATE policy on org_user: opening the
-- table to admin updates would also let them rewrite role, is_active and
-- organisation_id, which policies cannot restrict per column.
CREATE OR REPLACE FUNCTION public.set_org_user_permissions(
  p_user_id uuid,
  p_permissions public.org_permission[]
)
RETURNS public.org_permission[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.set_org_user_permissions(uuid, public.org_permission[])
  FROM PUBLIC, anon;
GRANT EXECUTE
  ON FUNCTION public.set_org_user_permissions(uuid, public.org_permission[])
  TO authenticated;

COMMENT ON FUNCTION public.set_org_user_permissions(uuid, public.org_permission[]) IS
  'Admin-only: replace a member''s area permissions. Takes effect on the member''s next token refresh.';

-- ============================================================================
-- Surface permissions alongside the rest of the user listing
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_organisation_users();

CREATE OR REPLACE FUNCTION public.get_organisation_users()
RETURNS TABLE(
  id uuid,
  email text,
  name text,
  organisation_id uuid,
  joined_at timestamp with time zone,
  role public.org_user_types,
  permissions public.org_permission[],
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;
