begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Provider capability is additive. Provider organisations use the same
-- per-member permissions as every other organisation.

select has_column(
  'public',
  'organisation',
  'is_testing_provider',
  'organisations expose an additive testing-provider capability'
);

select hasnt_column(
  'public',
  'organisation',
  'type',
  'organisations no longer have an exclusive type'
);

select ok(
  to_regtype('public.organisation_type') is null,
  'the exclusive organisation type enum is removed'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_trigger
    where tgrelid in (
      'public.org_user'::regclass,
      'public.invitation'::regclass
    )
      and tgname in (
        'org_user_normalise_permissions',
        'invitation_normalise_permissions'
      )
      and not tgisinternal
  $$,
  array[0],
  'provider capability does not normalise member permissions'
);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'perm-provider-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'perm-provider-member@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'perm-ordinary-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'perm-ordinary-member@test.invalid');

insert into public.organisation (id, name, owner_id)
values
  ('e1000000-0000-0000-0000-000000000001', 'Permissions provider org', 'e0000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002', 'Permissions ordinary org', 'e0000000-0000-0000-0000-000000000003');

select lives_ok(
  $$
    update public.organisation
    set is_testing_provider = true
    where id = 'e1000000-0000-0000-0000-000000000001'
  $$,
  'an existing seed-owning organisation can add provider capability'
);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'Member', true, '{collections}'),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', 'Admin', true, '{}'),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004', 'Member', true, '{collections}');

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000002'
  ),
  array['collections']::public.org_permission[],
  'a provider member keeps collections access'
);

update public.org_user
set permissions = array['collections', 'inventory']::public.org_permission[]
where user_id = 'e0000000-0000-0000-0000-000000000002';

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000002'
  ),
  array['collections', 'inventory']::public.org_permission[],
  'a provider member may hold both permission areas'
);

update public.org_user
set permissions = '{}'::public.org_permission[]
where user_id = 'e0000000-0000-0000-0000-000000000002';

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000002'
  ),
  '{}'::public.org_permission[],
  'a provider member may be left with no area access'
);

insert into public.invitation (
  id, organisation_id, email, name, role, permissions, token, invited_by
)
values (
  'e2000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'invited-provider@test.invalid',
  'Invited to provider',
  'Member',
  array['collections']::public.org_permission[],
  'e3000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001'
);

select is(
  (
    select permissions
    from public.invitation
    where id = 'e2000000-0000-0000-0000-000000000001'
  ),
  array['collections']::public.org_permission[],
  'an invitation to a provider preserves the chosen permissions'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"e1000000-0000-0000-0000-000000000001","role":"Admin"}}',
  true
);

select lives_ok(
  $$
    select public.set_org_user_permissions(
      'e0000000-0000-0000-0000-000000000002',
      array['inventory']::public.org_permission[]
    )
  $$,
  'a provider admin can change a member permission set'
);

reset role;

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000002'
  ),
  array['inventory']::public.org_permission[],
  'the provider member receives the permissions its admin chose'
);

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000004'
  ),
  array['collections']::public.org_permission[],
  'ordinary organisation member permissions remain unchanged'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organisation_link'
      and column_name in ('requesting_org_id', 'provider_org_id')
  $$,
  array[2],
  'accepted links use neutral requester and provider roles'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organisation_link_request'
      and column_name in ('requesting_org_id', 'provider_org_id')
  $$,
  array[2],
  'link requests use neutral requester and provider roles'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('organisation_link', 'organisation_link_request')
      and column_name in (
        concat('general', '_org_id'),
        concat('testing', '_org_id')
      )
  $$,
  array[0],
  'link tables have no exclusive organisation-role columns'
);

select * from finish();

rollback;
