begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- ============================================================================
-- Fixtures
-- ============================================================================
-- One General and one Testing organisation, so every assertion can be stated
-- as "the same write, in each kind of organisation".

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'perm-general-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'perm-general-member@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'perm-testing-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'perm-testing-member@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'perm-testing-member-2@test.invalid');

insert into public.organisation (id, name, owner_id, type)
values
  ('e1000000-0000-0000-0000-000000000001', 'Permissions General org', 'e0000000-0000-0000-0000-000000000001', 'General'),
  ('e1000000-0000-0000-0000-000000000002', 'Permissions Testing org', 'e0000000-0000-0000-0000-000000000003', 'Testing');

-- ============================================================================
-- 1. The trigger exists on both tables carrying permissions
-- ============================================================================

select results_eq(
  $$
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.org_user'::regclass
      and tgname = 'org_user_normalise_permissions'
      and not tgisinternal
  $$,
  array[1],
  'org_user normalises member permissions'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.invitation'::regclass
      and tgname = 'invitation_normalise_permissions'
      and not tgisinternal
  $$,
  array[1],
  'invitation normalises member permissions'
);

-- ============================================================================
-- 2. A Testing organisation Member always holds exactly {inventory}
-- ============================================================================

-- Asking for collections, the wrong area entirely.
insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values (
  'e1000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000004',
  'Member',
  true,
  ARRAY['collections']::public.org_permission[]
);

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000004'
  ),
  ARRAY['inventory']::public.org_permission[],
  'a Testing organisation member asking for collections is given inventory'
);

-- Asking for nothing at all, which is what the column default supplies.
insert into public.org_user (organisation_id, user_id, role, is_active)
values (
  'e1000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000005',
  'Member',
  true
);

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000005'
  ),
  ARRAY['inventory']::public.org_permission[],
  'a Testing organisation member created with no permissions is given inventory'
);

-- And it cannot be taken away by a later direct update.
update public.org_user
set permissions = ARRAY['collections']::public.org_permission[]
where user_id = 'e0000000-0000-0000-0000-000000000004';

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000004'
  ),
  ARRAY['inventory']::public.org_permission[],
  'a direct update cannot move a Testing organisation member off inventory'
);

update public.org_user
set permissions = '{}'::public.org_permission[]
where user_id = 'e0000000-0000-0000-0000-000000000004';

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000004'
  ),
  ARRAY['inventory']::public.org_permission[],
  'a direct update cannot strip a Testing organisation member of all access'
);

-- ============================================================================
-- 3. Admins are untouched in both kinds of organisation
-- ============================================================================

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values (
  'e1000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000003',
  'Admin',
  true,
  '{}'::public.org_permission[]
);

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000003'
  ),
  '{}'::public.org_permission[],
  'a Testing organisation admin keeps an empty permission set'
);

select ok(
  public.has_org_permission('inventory'),
  'has_org_permission still short-circuits on the Admin role'
) from (select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"e1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
)) claims;

-- ============================================================================
-- 4. General organisations keep the choice
-- ============================================================================

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  (
    'e1000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000001',
    'Admin',
    true,
    '{}'::public.org_permission[]
  ),
  (
    'e1000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    'Member',
    true,
    ARRAY['collections']::public.org_permission[]
  );

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000002'
  ),
  ARRAY['collections']::public.org_permission[],
  'a General organisation member keeps collections'
);

update public.org_user
set permissions = ARRAY['collections', 'inventory']::public.org_permission[]
where user_id = 'e0000000-0000-0000-0000-000000000002';

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000002'
  ),
  ARRAY['collections', 'inventory']::public.org_permission[],
  'a General organisation member can hold both areas'
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
  'a General organisation member can be left with no access'
);

-- ============================================================================
-- 5. Invitations obey the same rule
-- ============================================================================

insert into public.invitation (
  id, organisation_id, email, name, role, permissions, token, invited_by
)
values (
  'e2000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000002',
  'invited-testing@test.invalid',
  'Invited to testing',
  'Member',
  ARRAY['collections']::public.org_permission[],
  'e3000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000003'
);

select is(
  (
    select permissions
    from public.invitation
    where id = 'e2000000-0000-0000-0000-000000000001'
  ),
  ARRAY['inventory']::public.org_permission[],
  'an invitation to a Testing organisation is normalised to inventory'
);

insert into public.invitation (
  id, organisation_id, email, name, role, permissions, token, invited_by
)
values (
  'e2000000-0000-0000-0000-000000000002',
  'e1000000-0000-0000-0000-000000000001',
  'invited-general@test.invalid',
  'Invited to general',
  'Member',
  ARRAY['collections']::public.org_permission[],
  'e3000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000001'
);

select is(
  (
    select permissions
    from public.invitation
    where id = 'e2000000-0000-0000-0000-000000000002'
  ),
  ARRAY['collections']::public.org_permission[],
  'an invitation to a General organisation keeps its chosen areas'
);

-- ============================================================================
-- 6. set_org_user_permissions offers no choice in a Testing organisation
-- ============================================================================

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"e1000000-0000-0000-0000-000000000002","role":"Admin"}}',
  true
);

select throws_ok(
  $$
    select public.set_org_user_permissions(
      'e0000000-0000-0000-0000-000000000004',
      ARRAY['collections']::public.org_permission[]
    )
  $$,
  '22023',
  null,
  'a Testing organisation admin cannot change a member''s permissions'
);

-- The General organisation admin still can.
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"e1000000-0000-0000-0000-000000000001","role":"Admin"}}',
  true
);

select lives_ok(
  $$
    select public.set_org_user_permissions(
      'e0000000-0000-0000-0000-000000000002',
      ARRAY['inventory']::public.org_permission[]
    )
  $$,
  'a General organisation admin can still change a member''s permissions'
);

reset role;

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000002'
  ),
  ARRAY['inventory']::public.org_permission[],
  'the General organisation member has the permissions the admin chose'
);

select is(
  (
    select permissions
    from public.org_user
    where user_id = 'e0000000-0000-0000-0000-000000000004'
  ),
  ARRAY['inventory']::public.org_permission[],
  'the rejected call left the Testing organisation member on inventory'
);

select * from finish();

rollback;
