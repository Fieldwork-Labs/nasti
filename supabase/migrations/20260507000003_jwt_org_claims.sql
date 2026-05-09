-- Custom access token hook: bake the user's organisation_id and role into the
-- JWT at issuance, so RLS policies can read them without joining org_user
-- on every row.
--
-- Trade-off: claims are frozen until the JWT refreshes (default 1h). If a
-- user's org membership or role changes, their session keeps the old values
-- until refresh. Acceptable for NASTI's admin-managed user base.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_claims jsonb;
  v_org_id uuid;
  v_role text;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims := COALESCE(event -> 'claims', '{}'::jsonb);

  SELECT ou.organisation_id, ou.role
  INTO v_org_id, v_role
  FROM public.org_user ou
  WHERE ou.user_id = v_user_id
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{organisation_id}', to_jsonb(v_org_id::text));
  END IF;
  IF v_role IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- Restrict to the auth admin role only; anon/authenticated must not be able
-- to call this and forge claims for themselves.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- The hook runs as supabase_auth_admin and needs to read org_user.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.org_user TO supabase_auth_admin;

-- Replace the existing helper to read from JWT claims instead of joining
-- org_user. Callers (RLS policies, storage bucket policies, get_trip RPC)
-- keep working unchanged.
CREATE OR REPLACE FUNCTION public.get_user_organisation_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT NULLIF(((SELECT auth.jwt()) ->> 'organisation_id'), '')::uuid
$$;

-- New helper for role checks in RLS, mirroring the existing pattern.
CREATE OR REPLACE FUNCTION public.auth_org_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT NULLIF(((SELECT auth.jwt()) ->> 'user_role'), '')
$$;

GRANT EXECUTE ON FUNCTION public.auth_org_role() TO authenticated;
