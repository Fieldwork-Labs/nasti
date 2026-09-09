-- Read the organisation and role claims written by the canonical access-token
-- hook in 20260608121845_custom_access_token_hook.sql. Keeping the hook itself
-- in one migration avoids competing definitions when these pending security
-- audit migrations are applied to an existing environment.
--
-- Trade-off: claims are frozen until the JWT refreshes (default 1h). If a
-- user's org membership or role changes, their session keeps the old values
-- until refresh. Acceptable for NASTI's admin-managed user base.

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
  SELECT NULLIF(
    (SELECT auth.jwt()) -> 'app_metadata' ->> 'org_id',
    ''
  )::uuid
$$;

GRANT EXECUTE ON FUNCTION public.get_user_organisation_id() TO authenticated;

-- New helper for role checks in RLS, mirroring the existing pattern.
CREATE OR REPLACE FUNCTION public.auth_org_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT NULLIF(
    (SELECT auth.jwt()) -> 'app_metadata' ->> 'role',
    ''
  )
$$;

GRANT EXECUTE ON FUNCTION public.auth_org_role() TO authenticated;
