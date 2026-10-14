begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

-- A quality test recorded with the wrong type or weights is deleted and
-- recorded again. Deleting it restores the seed it consumed through a
-- correction, hides it from every reader, and is refused when the bag no
-- longer stands for that seed.

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'delete-test-owner@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'delete-test-lab@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'delete-test-intruder@test.invalid');

insert into public.organisation (id, name, owner_id, is_testing_provider)
values
  ('d1000000-0000-0000-0000-000000000001', 'Delete owner', 'd0000000-0000-0000-0000-000000000001', false),
  ('d1000000-0000-0000-0000-000000000002', 'Delete lab', 'd0000000-0000-0000-0000-000000000002', true),
  ('d1000000-0000-0000-0000-000000000003', 'Delete intruder', 'd0000000-0000-0000-0000-000000000003', false);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'Admin', true, '{}'),
  ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'Admin', true, '{}');

insert into public.organisation_link (requesting_org_id, provider_org_id, created_by)
values (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000001'
);

insert into public.batches (id, organisation_id, code)
values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'DELETE-1');

insert into public.batch_custody (batch_id, organisation_id)
values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001');

insert into public.sub_batches (id, batch_id, weight_grams, notes)
values
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 100, 'Tested, deleted, re-tested'),
  ('d3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 50, 'Tested then merged'),
  ('d3000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000001', 50, 'Merge partner'),
  ('d3000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000001', 10, 'Used up at the lab'),
  ('d3000000-0000-0000-0000-000000000005', 'd2000000-0000-0000-0000-000000000001', 40, 'Partly tested at the lab');

create temporary table deleted_test (key text, id uuid);
grant insert, select on deleted_test to authenticated;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

-- Deleting and recording again ---------------------------------------------

select lives_ok(
  $$
    insert into deleted_test (key, id)
    select 'wrong', public.fn_create_quality_test(
      'd2000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000001',
      '{"test_type":"cut test","repeats":[{"weight_grams":10}]}'::jsonb,
      'd1000000-0000-0000-0000-000000000001'
    )
  $$,
  'the owner records a 10g cut test'
);

select throws_ok(
  $$
    delete from public.tests
    where id = (select id from deleted_test where key = 'wrong')
  $$,
  '42501',
  null,
  'a test cannot be deleted directly'
);

select throws_ok(
  $$
    update public.tests
    set deleted_at = now()
    where id = (select id from deleted_test where key = 'wrong')
  $$,
  '42501',
  null,
  'a test cannot be marked deleted directly'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000003","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_delete_quality_test(
      (select id from deleted_test where key = 'wrong')
    )
  $$,
  '42501',
  null,
  'another organisation cannot delete the test'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_delete_quality_test(
      (select id from deleted_test where key = 'wrong')
    )
  $$,
  'the owner deletes the test'
);

select is(
  (
    select count(*)
    from public.tests
    where id = (select id from deleted_test where key = 'wrong')
  ),
  0::bigint,
  'the deleted test is no longer readable'
);

select throws_ok(
  $$
    select public.fn_delete_quality_test(
      (select id from deleted_test where key = 'wrong')
    )
  $$,
  'P0002',
  null,
  'a test cannot be deleted twice'
);

reset role;

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = 'd3000000-0000-0000-0000-000000000001'
  ),
  100::numeric,
  'deleting the test restores the seed it consumed'
);

select results_eq(
  $$
    select correction.kind::text, correction.weight_grams
    from public.batch_weight_adjustments correction
    inner join public.batch_weight_adjustments consumption
      on consumption.id = correction.corrects_adjustment_id
    where consumption.test_id = (select id from deleted_test where key = 'wrong')
  $$,
  $$ values ('correction'::text, 10::numeric) $$,
  'the ledger keeps the consumption and records a correction against it'
);

select isnt(
  (
    select deleted_at
    from public.tests
    where id = (select id from deleted_test where key = 'wrong')
  ),
  null::timestamptz,
  'the test row is kept and marked deleted'
);

set local role authenticated;

select lives_ok(
  $$
    select public.fn_create_quality_test(
      'd2000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000001',
      '{"test_type":"cut test","repeats":[{"weight_grams":20}]}'::jsonb,
      'd1000000-0000-0000-0000-000000000001'
    )
  $$,
  'the owner records the test again with the right weight'
);

reset role;

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = 'd3000000-0000-0000-0000-000000000001'
  ),
  80::numeric,
  'the re-recorded test deducts its seed once'
);

-- A merged bag ---------------------------------------------------------------

set local role authenticated;

select lives_ok(
  $$
    insert into deleted_test (key, id)
    select 'merged', public.fn_create_quality_test(
      'd2000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000002',
      '{"test_type":"cut test","repeats":[{"weight_grams":5}]}'::jsonb,
      'd1000000-0000-0000-0000-000000000001'
    )
  $$,
  'the owner tests a bag'
);

select lives_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        'd3000000-0000-0000-0000-000000000002',
        'd3000000-0000-0000-0000-000000000003'
      ]::uuid[]
    )
  $$,
  'the owner merges that bag into a new one'
);

select throws_ok(
  $$
    select public.fn_delete_quality_test(
      (select id from deleted_test where key = 'merged')
    )
  $$,
  '55000',
  null,
  'a test cannot be deleted once its bag has been merged away'
);

-- Repointing the test at a bag the caller still holds would pass the checks
-- against that bag while the seed went back to the merged-away one.

select throws_ok(
  $$
    update public.tests
    set sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
    where id = (select id from deleted_test where key = 'merged')
  $$,
  '42501',
  null,
  'a caller cannot move a test to another bag'
);

reset role;

select throws_ok(
  $$
    update public.tests
    set sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
    where id = (select id from deleted_test where key = 'merged')
  $$,
  '22023',
  null,
  'a test''s bag is fixed even for privileged updates'
);

-- A test repointed before its bag was fixed.
alter table public.tests disable trigger tests_bag_immutable;

update public.tests
set sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
where id = (select id from deleted_test where key = 'merged');

alter table public.tests enable trigger tests_bag_immutable;

set local role authenticated;

select throws_ok(
  $$
    select public.fn_delete_quality_test(
      (select id from deleted_test where key = 'merged')
    )
  $$,
  '55000',
  null,
  'a repointed test cannot be deleted to restore seed to its original bag'
);

reset role;

select is(
  (
    select count(*)
    from public.batch_weight_adjustments correction
    inner join public.batch_weight_adjustments consumption
      on consumption.id = correction.corrects_adjustment_id
    where consumption.test_id = (select id from deleted_test where key = 'merged')
  ),
  0::bigint,
  'no seed is restored to the merged-away bag'
);

set local role authenticated;

-- Laboratory tests -----------------------------------------------------------

select lives_ok(
  $$
    select * from public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000004"},{"sub_batch_id":"d3000000-0000-0000-0000-000000000005"}]'::jsonb
    )
  $$,
  'the owner sends two bags to the lab'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

insert into deleted_test (key, id)
select 'used up', public.fn_create_quality_test(
  'd2000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000004',
  '{"test_type":"cut test","repeats":[{"weight_grams":10}]}'::jsonb,
  'd1000000-0000-0000-0000-000000000002'
);

insert into deleted_test (key, id)
select 'lab partial', public.fn_create_quality_test(
  'd2000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000005',
  '{"test_type":"cut test","repeats":[{"weight_grams":5}]}'::jsonb,
  'd1000000-0000-0000-0000-000000000002'
);

select throws_ok(
  $$
    select public.fn_delete_quality_test(
      (select id from deleted_test where key = 'used up')
    )
  $$,
  '55000',
  null,
  'a test that used up a bag at the lab cannot be deleted'
);

select lives_ok(
  $$
    select public.fn_delete_quality_test(
      (select id from deleted_test where key = 'lab partial')
    )
  $$,
  'the lab deletes a test on a bag it still holds'
);

select is(
  (
    select count(*)
    from public.fn_testing_test_history() history
    where history.test_id = (select id from deleted_test where key = 'lab partial')
  ),
  0::bigint,
  'the lab''s history no longer lists the deleted test'
);

reset role;

select * from finish();

rollback;
