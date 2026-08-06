begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

-- ============================================================================
-- Fixtures
-- ============================================================================
-- One General owner, three linked Testing organisations and one unlinked one,
-- and eight batches so that each state transition gets a batch of its own and
-- assertions never interfere. Links no longer carry capability flags, so the
-- three linked organisations differ only by identity.

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'assign-general-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'assign-general-member@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'assign-testing-linked-a@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'assign-testing-linked-b@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'assign-testing-linked-c@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'assign-testing-unlinked@test.invalid');

insert into public.organisation (id, name, owner_id, type)
values
  ('c1000000-0000-0000-0000-000000000001', 'Assignment General owner', 'c0000000-0000-0000-0000-000000000001', 'General'),
  ('c1000000-0000-0000-0000-000000000002', 'Assignment Testing linked A', 'c0000000-0000-0000-0000-000000000003', 'Testing'),
  ('c1000000-0000-0000-0000-000000000003', 'Assignment Testing linked B', 'c0000000-0000-0000-0000-000000000004', 'Testing'),
  ('c1000000-0000-0000-0000-000000000004', 'Assignment Testing linked C', 'c0000000-0000-0000-0000-000000000005', 'Testing'),
  ('c1000000-0000-0000-0000-000000000005', 'Assignment Testing unlinked', 'c0000000-0000-0000-0000-000000000006', 'Testing');

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Member', true, '{inventory}'),
  ('c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'Admin', true, '{}'),
  ('c1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'Admin', true, '{}'),
  ('c1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005', 'Admin', true, '{}'),
  ('c1000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000006', 'Admin', true, '{}');

-- An accepted link is the whole permission; the capability flags are gone.
-- Organisations 3 and 4 remain as ordinary linked Testing organisations so the
-- batch fixtures below keep their existing numbering.
insert into public.organisation_link (
  general_org_id, testing_org_id, created_by
)
values
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001');

insert into public.species (id, name, organisation_id)
values ('c5000000-0000-0000-0000-000000000001', 'Assignment fixture species', 'c1000000-0000-0000-0000-000000000001');

-- org_user projects its own person row, so the collector is looked up rather
-- than inserted.
insert into public.collection (
  id, species_id, organisation_id, collected_by, collected_on, person_ids, code
)
select
  'c7000000-0000-0000-0000-000000000001',
  'c5000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  current_date,
  array[p.id],
  'ASSIGNFIX-CO.TST.26'
from public.person p
where p.organisation_id = 'c1000000-0000-0000-0000-000000000001'
  and p.user_id = 'c0000000-0000-0000-0000-000000000001';

-- The collection trigger provisions an origin batch; the fixture batches below
-- are explicit so that weights and codes are deterministic.
insert into public.batches (id, collection_id, organisation_id, code, weight_grams)
values
  ('c2000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B1', 1000),
  ('c2000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B2', 1000),
  ('c2000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B3', 1000),
  ('c2000000-0000-0000-0000-000000000004', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B4', 1000),
  ('c2000000-0000-0000-0000-000000000005', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B5', 1000),
  ('c2000000-0000-0000-0000-000000000006', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B6', 1000),
  ('c2000000-0000-0000-0000-000000000007', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B7', 1000),
  ('c2000000-0000-0000-0000-000000000008', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B8', 1000),
  -- B9 and B10 exist purely as targets for the direct-write probes below. Those
  -- writes still succeed before this plan lands, so they are kept away from
  -- every other assertion and their effects are undone afterwards.
  ('c2000000-0000-0000-0000-000000000009', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B9', 1000),
  ('c2000000-0000-0000-0000-000000000010', 'c7000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'ASSIGNFIX-B10', 1000);

insert into public.batch_custody (batch_id, organisation_id)
select id, 'c1000000-0000-0000-0000-000000000001'
from public.batches
where code like 'ASSIGNFIX-B%';

insert into public.sub_batches (id, batch_id, weight_grams)
values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 1000),
  ('c3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 1000),
  ('c3000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000003', 1000),
  ('c3000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000004', 1000),
  ('c3000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000005', 1000),
  ('c3000000-0000-0000-0000-000000000006', 'c2000000-0000-0000-0000-000000000006', 1000),
  ('c3000000-0000-0000-0000-000000000007', 'c2000000-0000-0000-0000-000000000007', 1000),
  ('c3000000-0000-0000-0000-000000000008', 'c2000000-0000-0000-0000-000000000008', 1000);

insert into public.storage_locations (id, organisation_id, name, active)
values
  ('c4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'Testing retained sample shelf', true),
  ('c4000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'General shelf', true);

-- ============================================================================
-- 1. Function privileges
-- ============================================================================

-- Treating is no longer a supported workflow. The function must be gone
-- entirely rather than merely unreachable, so that no privilege drift can
-- bring it back.
select results_eq(
  $$
    select count(*)::integer
    from information_schema.routines
    where specific_schema = 'public'
      and routine_name = 'fn_treat_batch'
  $$,
  array[0],
  'fn_treat_batch no longer exists in any overload'
);

select has_function(
  'public',
  'fn_assign_batches_for_testing',
  array['uuid', 'jsonb'],
  'fn_assign_batches_for_testing exists'
);

select has_function(
  'public',
  'fn_return_batch_from_testing',
  array['uuid', 'numeric', 'uuid'],
  'fn_return_batch_from_testing exists'
);

-- Read through the catalogue rather than has_function_privilege: the latter
-- raises when the function is absent, which would abort the whole file before
-- the RPCs exist.
select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'fn_assign_batches_for_testing',
        'fn_return_batch_from_testing'
      )
      and grantee in ('PUBLIC', 'anon')
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'neither PUBLIC nor anon can execute the assignment RPCs'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'fn_assign_batches_for_testing',
        'fn_return_batch_from_testing'
      )
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  $$,
  array[2],
  'authenticated can execute both assignment RPCs'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_proc p
    inner join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'fn_assign_batches_for_testing',
        'fn_return_batch_from_testing'
      )
      and p.prosecdef
      and p.proconfig @> array['search_path=""']
  $$,
  array[2],
  'assignment RPCs are security definer with an empty search_path'
);

-- ============================================================================
-- 2. An active assignment is unique per batch
-- ============================================================================

select results_eq(
  $$
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'batch_testing_assignment'
      and indexdef like '%UNIQUE%'
      and indexdef like '%batch_id%'
      and indexdef like '%returned_at IS NULL%'
  $$,
  array[1],
  'a partial unique index allows at most one active assignment per batch'
);

-- ============================================================================
-- 3. Assignment authorisation
-- ============================================================================

-- A General Member with inventory permission still cannot assign.
select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"c1000000-0000-0000-0000-000000000001","role":"Member","permissions":["inventory"]}}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000006","assignment_type":"sample","sample_weight_grams":50}]'::jsonb
    )
  $$,
  '42501',
  null,
  'a non-admin General member cannot assign a batch for testing'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"c1000000-0000-0000-0000-000000000001","role":"Admin"}}',
  true
);

select throws_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000005',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000006","assignment_type":"sample","sample_weight_grams":50}]'::jsonb
    )
  $$,
  '42501',
  null,
  'an unlinked Testing organisation cannot receive an assignment'
);

select throws_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[]'::jsonb
    )
  $$,
  '22023',
  null,
  'an empty assignment array is rejected'
);

select throws_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000006","assignment_type":"sample","sample_weight_grams":5000}]'::jsonb
    )
  $$,
  '22023',
  null,
  'a sample heavier than the batch is rejected'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where batch_id in (
      'c2000000-0000-0000-0000-000000000006',
      'c2000000-0000-0000-0000-000000000007'
    )
  ),
  0::bigint,
  'no rejected request left an assignment behind'
);

-- ============================================================================
-- 4. A multi-item request over an accepted link succeeds
-- ============================================================================

select lives_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000006","assignment_type":"sample","sample_weight_grams":50},
        {"batch_id":"c2000000-0000-0000-0000-000000000007","assignment_type":"full_batch"}]'::jsonb
    )
  $$,
  'an accepted link accepts a request covering several batches'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where assigned_to_org_id = 'c1000000-0000-0000-0000-000000000002'
      and batch_id in (
        'c2000000-0000-0000-0000-000000000006',
        'c2000000-0000-0000-0000-000000000007'
      )
      and returned_at is null
  ),
  2::bigint,
  'the mixed request created one assignment per batch'
);

-- ============================================================================
-- 5. Duplicate active assignments and multi-batch atomicity
-- ============================================================================

select throws_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000006","assignment_type":"sample","sample_weight_grams":25}]'::jsonb
    )
  $$,
  '55000',
  null,
  'a second active assignment for the same batch is rejected'
);

select throws_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000008","assignment_type":"sample","sample_weight_grams":25},
        {"batch_id":"c2000000-0000-0000-0000-000000000006","assignment_type":"sample","sample_weight_grams":25}]'::jsonb
    )
  $$,
  '55000',
  null,
  'a multi-batch request fails when any one batch is already assigned'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where batch_id = 'c2000000-0000-0000-0000-000000000008'
  ),
  0::bigint,
  'a failed multi-batch request rolls back the batches that would have succeeded'
);

select throws_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000008","assignment_type":"sample","sample_weight_grams":25},
        {"batch_id":"c2000000-0000-0000-0000-000000000008","assignment_type":"sample","sample_weight_grams":25}]'::jsonb
    )
  $$,
  '22023',
  null,
  'a request naming the same batch twice is rejected'
);

-- ============================================================================
-- 6. Sample assignments do not move custody; full batches do
-- ============================================================================

select lives_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000002","assignment_type":"sample","sample_weight_grams":100}]'::jsonb
    )
  $$,
  'a sample assignment is accepted'
);

select is(
  (
    select organisation_id
    from public.current_batch_custody
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
  ),
  'c1000000-0000-0000-0000-000000000001'::uuid,
  'a sample assignment leaves current custody with the owner'
);

select is(
  (
    select count(*)
    from public.batch_custody
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'a sample assignment appends no custody row'
);

select lives_ok(
  $$
    select public.fn_assign_batches_for_testing(
      'c1000000-0000-0000-0000-000000000002',
      '[{"batch_id":"c2000000-0000-0000-0000-000000000001","assignment_type":"full_batch"}]'::jsonb
    )
  $$,
  'a full-batch assignment is accepted'
);

-- Custody itself is read as the table owner: batch_custody only shows rows to
-- the *current* custodian, so the organisation that just gave the batch away
-- cannot verify the transfer through RLS.
reset role;

select is(
  (
    select organisation_id
    from public.current_batch_custody
    where batch_id = 'c2000000-0000-0000-0000-000000000001'
  ),
  'c1000000-0000-0000-0000-000000000002'::uuid,
  'a full-batch assignment transfers current custody to the Testing organisation'
);

select is(
  (
    select previous_organisation_id
    from public.batch_custody
    where batch_id = 'c2000000-0000-0000-0000-000000000001'
      and organisation_id = 'c1000000-0000-0000-0000-000000000002'
  ),
  'c1000000-0000-0000-0000-000000000001'::uuid,
  'the custody transfer records the assigning organisation as previous custodian'
);

set local role authenticated;

select is(
  (
    select organisation_id
    from public.batches
    where id = 'c2000000-0000-0000-0000-000000000001'
  ),
  'c1000000-0000-0000-0000-000000000001'::uuid,
  'a full-batch assignment does not change ownership'
);

-- The owner must keep reading its batch while the Testing organisation holds it.
select is(
  (
    select count(*)
    from public.batches
    where id = 'c2000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'the owner still reads its batch while a Testing organisation has custody'
);

-- ============================================================================
-- 7. Direct table writes are rejected
-- ============================================================================
-- The RPCs are meant to be the only mutation boundary. These probes run against
-- their own batches so that a write which still succeeds today cannot change
-- the state the later sections assert on.

reset role;

insert into public.batch_testing_assignment (
  id, batch_id, assigned_to_org_id, assigned_by_org_id, assignment_type
)
values (
  'c8000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000009',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000001',
  'full_batch'
);

set local role authenticated;

-- INSERT is attempted as the General Admin, the role the current policy allows.
select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"c1000000-0000-0000-0000-000000000001","role":"Admin"}}',
  true
);

select throws_ok(
  $$
    insert into public.batch_testing_assignment (
      batch_id, assigned_to_org_id, assigned_by_org_id, assignment_type
    )
    values (
      'c2000000-0000-0000-0000-000000000010',
      'c1000000-0000-0000-0000-000000000002',
      'c1000000-0000-0000-0000-000000000001',
      'full_batch'
    )
  $$,
  '42501',
  null,
  'a direct assignment INSERT is rejected'
);

-- RLS filters UPDATE and DELETE rather than raising, so the observable contract
-- for those is that the row is neither changed nor removed.
select lives_ok(
  $$
    delete from public.batch_testing_assignment
    where id = 'c8000000-0000-0000-0000-000000000001'
  $$,
  'a direct assignment DELETE runs without error'
);

-- Custody history is append-only, so the current custodian must not be able to
-- rewrite or erase it.
select lives_ok(
  $$
    update public.batch_custody
    set organisation_id = 'c1000000-0000-0000-0000-000000000002'
    where batch_id = 'c2000000-0000-0000-0000-000000000010'
  $$,
  'a direct custody UPDATE runs without error'
);

select lives_ok(
  $$
    delete from public.batch_custody
    where batch_id = 'c2000000-0000-0000-0000-000000000010'
  $$,
  'a direct custody DELETE runs without error'
);

-- UPDATE is attempted as the Testing Admin, the role the current policy allows.
select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"c1000000-0000-0000-0000-000000000002","role":"Admin"}}',
  true
);

select lives_ok(
  $$
    update public.batch_testing_assignment
    set returned_at = now()
    where id = 'c8000000-0000-0000-0000-000000000001'
  $$,
  'a direct assignment UPDATE runs without error'
);

reset role;

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where id = 'c8000000-0000-0000-0000-000000000001'
      and returned_at is null
  ),
  1::bigint,
  'a direct assignment DELETE and UPDATE changed nothing'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where batch_id = 'c2000000-0000-0000-0000-000000000010'
  ),
  0::bigint,
  'a direct assignment INSERT stored nothing'
);

select is(
  (
    select count(*)
    from public.batch_custody
    where batch_id = 'c2000000-0000-0000-0000-000000000010'
      and organisation_id = 'c1000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'a direct custody UPDATE and DELETE left history intact'
);

set local role authenticated;

-- Undo whatever the probes managed to change, so the sections below start from
-- a known state regardless of which writes are still permitted.
reset role;

delete from public.batch_testing_assignment
where batch_id in (
  'c2000000-0000-0000-0000-000000000009',
  'c2000000-0000-0000-0000-000000000010'
);

delete from public.batch_custody
where batch_id = 'c2000000-0000-0000-0000-000000000010';

insert into public.batch_custody (batch_id, organisation_id)
values (
  'c2000000-0000-0000-0000-000000000010',
  'c1000000-0000-0000-0000-000000000001'
);

set local role authenticated;

-- ============================================================================
-- 8. An active sample assignment reads and tests
-- ============================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"c1000000-0000-0000-0000-000000000002","role":"Admin"}}',
  true
);

select is(
  (
    select count(*)
    from public.batches
    where id = 'c2000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'an active sample assignment grants batch SELECT to the Testing organisation'
);

select is(
  (
    select count(*)
    from public.sub_batches
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'an active sample assignment grants sub-batch SELECT to the Testing organisation'
);

select is(
  (
    select count(*)
    from public.collection
    where id = 'c7000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'an active assignment grants collection SELECT to the Testing organisation'
);

select lives_ok(
  $$
    select public.fn_create_quality_test(
      'c2000000-0000-0000-0000-000000000002',
      'c3000000-0000-0000-0000-000000000002',
      '{"repeats":[{"weight_grams":5}]}'::jsonb,
      'c1000000-0000-0000-0000-000000000002'
    )
  $$,
  'an active sample assignment permits creating a quality test'
);

select isnt(
  (
    select completed_at
    from public.batch_testing_assignment
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
  ),
  null,
  'the first quality test completes the assignment'
);

-- A repeat test must not disturb the assignment state machine.
select lives_ok(
  $$
    select public.fn_create_quality_test(
      'c2000000-0000-0000-0000-000000000002',
      'c3000000-0000-0000-0000-000000000002',
      '{"repeats":[{"weight_grams":5}]}'::jsonb,
      'c1000000-0000-0000-0000-000000000002'
    )
  $$,
  'a repeat quality test is still permitted'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'a repeat quality test creates no additional assignment'
);

select is(
  (
    select returned_at
    from public.batch_testing_assignment
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
  ),
  null,
  'a repeat quality test does not return the assignment'
);

-- ============================================================================
-- 9. Returning an assignment
-- ============================================================================

-- Full batch: custody returns to the assigning General organisation.
select lives_ok(
  $$
    select public.fn_return_batch_from_testing(
      (
        select id
        from public.batch_testing_assignment
        where assigned_to_org_id = 'c1000000-0000-0000-0000-000000000002'
          and returned_at is null
          and batch_id = 'c2000000-0000-0000-0000-000000000001'
      ),
      null,
      null
    )
  $$,
  'the Testing organisation may return a full-batch assignment'
);

reset role;

select is(
  (
    select cbc.organisation_id
    from public.current_batch_custody cbc
    where cbc.batch_id = 'c2000000-0000-0000-0000-000000000001'
  ),
  'c1000000-0000-0000-0000-000000000001'::uuid,
  'returning a full batch restores custody to the assigning organisation'
);

set local role authenticated;

-- Sample: retained-subsample metadata is validated, and no custody row appears.
select throws_ok(
  $$
    select public.fn_return_batch_from_testing(
      (
        select id
        from public.batch_testing_assignment
        where batch_id = 'c2000000-0000-0000-0000-000000000002'
      ),
      5000,
      'c4000000-0000-0000-0000-000000000001'
    )
  $$,
  '22023',
  null,
  'a retained subsample heavier than the sample is rejected'
);

select throws_ok(
  $$
    select public.fn_return_batch_from_testing(
      (
        select id
        from public.batch_testing_assignment
        where batch_id = 'c2000000-0000-0000-0000-000000000002'
      ),
      10,
      'c4000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  null,
  'a retained subsample cannot be stored in another organisation location'
);

select lives_ok(
  $$
    select public.fn_return_batch_from_testing(
      (
        select id
        from public.batch_testing_assignment
        where batch_id = 'c2000000-0000-0000-0000-000000000002'
      ),
      10,
      'c4000000-0000-0000-0000-000000000001'
    )
  $$,
  'a sample assignment may be returned with retained-subsample metadata'
);

-- Read the table itself rather than what the Testing organisation can see: for
-- a sample it never becomes custodian, so its own view of custody is empty
-- either way.
reset role;

select is(
  (
    select count(*)
    from public.batch_custody
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'returning a sample appends no custody row'
);

set local role authenticated;

select throws_ok(
  $$
    select public.fn_return_batch_from_testing(
      (
        select id
        from public.batch_testing_assignment
        where batch_id = 'c2000000-0000-0000-0000-000000000002'
      ),
      null,
      null
    )
  $$,
  '55000',
  null,
  'an already-returned assignment cannot be returned again'
);

-- ============================================================================
-- 10. A returned assignment grants nothing
-- ============================================================================

select is(
  (
    select count(*)
    from public.batches
    where id = 'c2000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'a returned assignment no longer grants batch SELECT'
);

select is(
  (
    select count(*)
    from public.sub_batches
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'a returned assignment no longer grants sub-batch SELECT'
);

select is(
  (
    select count(*)
    from public.tests
    where batch_id = 'c2000000-0000-0000-0000-000000000002'
      and performed_by_organisation_id = 'c1000000-0000-0000-0000-000000000002'
  ),
  2::bigint,
  'tests performed by the Testing organisation stay visible after return'
);

-- Historical custody alone must not keep the batch readable either.
select is(
  (
    select count(*)
    from public.batches
    where id = 'c2000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'past custody alone does not keep a returned batch readable'
);

reset role;

select * from finish();

rollback;
