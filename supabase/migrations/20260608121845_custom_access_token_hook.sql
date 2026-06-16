-- Custom Access Token Hook: inject org_id / org_name / role into the JWT.
--
-- Motivation: the PWA is used in remote fieldwork with days-to-weeks of
-- offline time. Previously, org/role were fetched via a live query to
-- org_user on every cold start (`useAuth`), which meant that after a
-- cache eviction the user could be "logged in" (session present) but
-- have no role/org available offline. Moving these into JWT claims ties
-- them to the session itself, so they are available wherever the session
-- is available (i.e. always, given the IndexedDB-backed auth storage).
--
-- Claims are written into `app_metadata` on every token issuance/refresh
-- and are accessible on the client as `session.user.app_metadata` and in
-- Postgres via `auth.jwt() -> 'app_metadata' ->> 'org_id'` (and friends).
--
-- RLS policies that currently subquery org_user can progressively move
-- to reading from the JWT — see the followup audit issue.
--
-- Security: function is `security invoker` per Supabase's auth-hooks
-- guidance. It executes as supabase_auth_admin (the role GoTrue
-- authenticates as when calling the hook) rather than as the function
-- owner, so a bug in the hook body cannot escalate privileges. We
-- explicitly grant supabase_auth_admin only the minimum needed to read
-- the two tables it joins, gated by RLS policies scoped to that role.
-- Reference: https://supabase.com/docs/guides/auth/auth-hooks

-- If a prior version of the function exists, its owner may have been
-- reassigned to supabase_auth_admin by the hook registration. The
-- migration runs as `postgres`, and `create or replace` requires the
-- caller to be the current owner — so reclaim ownership first. postgres
-- is a member of supabase_auth_admin (on both local and Supabase cloud),
-- so this succeeds. No-op on a fresh DB where the function doesn't exist.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'custom_access_token_hook'
  ) then
    execute 'alter function public.custom_access_token_hook(jsonb) owner to postgres';
  end if;
end
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
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
           'role', org_row.role
         );
    claims := jsonb_set(claims, '{app_metadata}', app_meta);
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;

-- Grants: supabase_auth_admin needs schema usage and select on the two
-- tables the hook reads. No other role is affected.
grant usage on schema public to supabase_auth_admin;
grant select on public.org_user to supabase_auth_admin;
grant select on public.organisation to supabase_auth_admin;

-- Lock down and authorise the auth service to invoke the hook.
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- RLS policies: org_user and organisation have RLS enabled and their
-- existing policies reference auth.uid(), which is null when the hook
-- runs (there is no authenticated user at token-issuance time). Add
-- permissive SELECT policies scoped strictly to supabase_auth_admin.
-- Because RLS policies are additive per role, these do NOT widen access
-- for authenticated / anon — the existing policies still govern them.
create policy "custom_access_token_hook_read_org_user"
on public.org_user
as permissive
for select
to supabase_auth_admin
using (true);

create policy "custom_access_token_hook_read_organisation"
on public.organisation
as permissive
for select
to supabase_auth_admin
using (true);

comment on function public.custom_access_token_hook(jsonb) is
  'Supabase access-token hook: injects org_id, org_name and role from org_user into the JWT app_metadata. Runs as security invoker (supabase_auth_admin). See migration 20260421000001.';


-- Helper: returns the caller's org_id from the JWT app_metadata claim,
-- populated by public.custom_access_token_hook on every token issuance.
--
-- security invoker; stable so the planner caches within a statement.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid
$$;

grant execute on function public.current_org_id() to authenticated;

-- Helper: returns the caller's role from the JWT app_metadata claim.
create or replace function public.current_user_role()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select auth.jwt() -> 'app_metadata' ->> 'role'
$$;

grant execute on function public.current_user_role() to authenticated;