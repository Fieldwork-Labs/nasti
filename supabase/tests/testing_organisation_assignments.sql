begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- This file keeps the small, organisation-level contracts that used to be
-- mixed into the batch-assignment fixture.  The multi-bag state machine lives
-- in sub_batch_testing_assignments.sql so these checks stay independent.

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'assignment-contract-general@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'assignment-contract-testing@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'assignment-contract-unlinked@test.invalid');

insert into public.organisation (id, name, owner_id, is_testing_provider)
values
  ('c1000000-0000-0000-0000-000000000001', 'Assignment contract requester', 'c0000000-0000-0000-0000-000000000001', false),
  ('c1000000-0000-0000-0000-000000000002', 'Assignment contract provider', 'c0000000-0000-0000-0000-000000000002', true),
  ('c1000000-0000-0000-0000-000000000003', 'Assignment contract unlinked provider', 'c0000000-0000-0000-0000-000000000003', true);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Admin', true, '{}'),
  ('c1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'Admin', true, '{}');

insert into public.organisation_link (
  requesting_org_id,
  provider_org_id,
  created_by
)
values (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000001'
);

insert into public.organisation_link (
  requesting_org_id,
  provider_org_id,
  created_by
)
values (
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c0000000-0000-0000-0000-000000000002'
);

select is(
  (
    select count(*)
    from public.organisation_link
    where requesting_org_id = 'c1000000-0000-0000-0000-000000000002'
      and provider_org_id = 'c1000000-0000-0000-0000-000000000003'
  ),
  1::bigint,
  'a provider may request services from another provider'
);

-- Capability flags were removed because every remaining assignment is a test.
select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organisation_link'
      and column_name in (concat('can', '_test'), concat('can', '_process'))
  $$,
  array[0],
  'organisation_link has no obsolete capability columns'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organisation_link_request'
      and column_name in (concat('can', '_test'), concat('can', '_process'))
  $$,
  array[0],
  'organisation_link_request has no obsolete capability columns'
);

select is(
  (
    select count(*)
    from public.organisation_link
    where requesting_org_id = 'c1000000-0000-0000-0000-000000000001'
      and provider_org_id = 'c1000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'an accepted organisation link remains the assignment permission'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routines
    where specific_schema = 'public'
      and routine_name = 'fn_' || 'assign_batches_for_testing'
  $$,
  array[0],
  'the old batch assignment RPC is gone'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routines
    where specific_schema = 'public'
      and routine_name = 'fn_' || 'return_batch_from_testing'
  $$,
  array[0],
  'the old batch return RPC is gone'
);

select has_function(
  'public',
  'fn_assign_bags_for_testing',
  array['uuid', 'jsonb'],
  'the bag-level assignment RPC exists'
);

select has_function(
  'public',
  'fn_return_bag_from_testing',
  array['uuid'],
  'the bag-level return RPC exists'
);

-- Read catalogue privileges instead of calling has_function_privilege: the
-- latter raises if an overload is absent and would abort this file early.
select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'fn_assign_bags_for_testing',
        'fn_return_bag_from_testing'
      )
      and grantee in ('PUBLIC', 'anon')
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'PUBLIC and anon cannot execute the bag assignment RPCs'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'fn_assign_bags_for_testing',
        'fn_return_bag_from_testing'
      )
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  $$,
  array[2],
  'authenticated can execute both bag assignment RPCs'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_proc p
    inner join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'fn_assign_bags_for_testing',
        'fn_return_bag_from_testing'
      )
      and p.prosecdef
      and p.proconfig @> array['search_path=""']
  $$,
  array[2],
  'both bag assignment RPCs are security definer functions with an empty search_path'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'batch_testing_assignment'
      and column_name in ('sub_batch_id', 'closed_at', 'outcome')
      and is_nullable = 'NO'
  $$,
  array[1],
  'sub_batch_id is required while closed_at and outcome remain nullable'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'batch_testing_assignment'
      and column_name in ('sub_batch_id', 'closed_at', 'outcome')
  $$,
  array[3],
  'the assignment table has the bag lifecycle columns'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'batch_testing_assignment'
      and column_name in (
        concat('assignment', '_type'),
        concat('sample', '_weight_grams'),
        concat('subsample', '_weight_grams'),
        concat('subsample', '_storage_location_id'),
        concat('return', 'ed_at')
      )
  $$,
  array[0],
  'the assignment table has no obsolete type, sample, subsample, or return columns'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'batch_testing_assignment'
      and indexdef like '%UNIQUE%'
      and indexdef like '%sub_batch_id%'
      and indexdef like '%closed_at IS NULL%'
  $$,
  array[1],
  'a bag can have at most one active assignment'
);

select * from finish();

rollback;
