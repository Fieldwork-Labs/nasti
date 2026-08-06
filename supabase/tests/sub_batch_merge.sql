begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

-- Isolated fixtures use the seeded admin as the current custodian.
insert into public.organisation (id, name, owner_id)
values (
  '91000000-0000-0000-0000-000000000001',
  'Sub-batch merge test other organisation',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

insert into public.batches (id, organisation_id, code)
values
  (
    '92000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'MERGE-TEST-1'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'MERGE-TEST-2'
  ),
  (
    '92000000-0000-0000-0000-000000000003',
    '91000000-0000-0000-0000-000000000001',
    'MERGE-TEST-OTHER-ORG'
  );

insert into public.batch_custody (batch_id, organisation_id)
values
  (
    '92000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  ),
  (
    '92000000-0000-0000-0000-000000000003',
    '91000000-0000-0000-0000-000000000001'
  );

insert into public.containers (
  id,
  organisation_id,
  name,
  purpose,
  active
)
values
  (
    '93000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Merge source bag',
    'storage',
    true
  ),
  (
    '93000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Merge source drum',
    'storage',
    true
  ),
  (
    '93000000-0000-0000-0000-000000000003',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Merge destination envelope',
    'storage',
    true
  ),
  (
    '93000000-0000-0000-0000-000000000004',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Merge inactive container',
    'storage',
    false
  ),
  (
    '93000000-0000-0000-0000-000000000005',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Merge collection bag',
    'collection',
    true
  ),
  (
    '93000000-0000-0000-0000-000000000006',
    '91000000-0000-0000-0000-000000000001',
    'Merge other organisation container',
    'storage',
    true
  );

insert into public.storage_locations (
  id,
  organisation_id,
  name
)
values
  (
    '94000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Merge source shelf'
  ),
  (
    '94000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Merge source cool room'
  ),
  (
    '94000000-0000-0000-0000-000000000003',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Merge destination cabinet'
  ),
  (
    '94000000-0000-0000-0000-000000000004',
    '91000000-0000-0000-0000-000000000001',
    'Merge other organisation shelf'
  );

insert into public.sub_batches (
  id,
  batch_id,
  container_id,
  weight_grams,
  notes
)
values
  (
    '95000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    100.25,
    'First successful source'
  ),
  (
    '95000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000002',
    59.75,
    'Second successful source'
  ),
  (
    '95000000-0000-0000-0000-000000000003',
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    10,
    'Validation source A'
  ),
  (
    '95000000-0000-0000-0000-000000000004',
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000002',
    20,
    'Validation source B'
  ),
  (
    '95000000-0000-0000-0000-000000000005',
    '92000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000001',
    30,
    'Cross-batch validation source'
  ),
  (
    '95000000-0000-0000-0000-000000000006',
    '92000000-0000-0000-0000-000000000003',
    '93000000-0000-0000-0000-000000000006',
    40,
    'Other organisation source A'
  ),
  (
    '95000000-0000-0000-0000-000000000007',
    '92000000-0000-0000-0000-000000000003',
    '93000000-0000-0000-0000-000000000006',
    50,
    'Other organisation source B'
  ),
  (
    '95000000-0000-0000-0000-000000000008',
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    5,
    'Zero-weight validation source'
  );

insert into public.batch_weight_adjustments (
  sub_batch_id,
  weight_grams,
  reason,
  created_by
)
values
  (
    '95000000-0000-0000-0000-000000000001',
    -0.25,
    'Historical source correction',
    'e18b3927-87a9-4dcc-8d59-148461504a02'
  ),
  (
    '95000000-0000-0000-0000-000000000008',
    -5,
    'Prepare zero-weight merge fixture',
    'e18b3927-87a9-4dcc-8d59-148461504a02'
  );

insert into public.batch_storage (
  id,
  batch_id,
  sub_batch_id,
  location_id,
  stored_at,
  notes
)
values
  (
    '96000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    '2026-07-28 01:00:00+00',
    'First source storage'
  ),
  (
    '96000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000002',
    '94000000-0000-0000-0000-000000000002',
    '2026-07-28 02:00:00+00',
    'Second source storage'
  ),
  (
    '96000000-0000-0000-0000-000000000003',
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000003',
    '94000000-0000-0000-0000-000000000001',
    '2026-07-28 03:00:00+00',
    'Validation source storage'
  ),
  (
    '96000000-0000-0000-0000-000000000004',
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000004',
    '94000000-0000-0000-0000-000000000002',
    '2026-07-28 04:00:00+00',
    'Validation source storage'
  );

insert into public.tests (
  id,
  batch_id,
  sub_batch_id,
  performed_by_organisation_id,
  type,
  result,
  tested_by
)
values (
  '97000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2',
  'quality',
  '{"status":"historical"}',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

create temporary table merge_result (id uuid);
create temporary table optional_merge_result (id uuid);
grant insert, select on merge_result, optional_merge_result to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into merge_result (id)
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000001',
        '95000000-0000-0000-0000-000000000002'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000003',
      '94000000-0000-0000-0000-000000000003',
      'Successful container-aware merge'
    )
  $$,
  'sub-batches can be merged into an explicit container and location'
);

reset role;

select is(
  (
    select current_weight
    from public.batch_current_weight
    where id = '92000000-0000-0000-0000-000000000001'
  ),
  189.75::numeric,
  'merge preserves the batch current weight'
);

select results_eq(
  $$
    select current_weight
    from public.sub_batch_current_weight
    where id in (
      '95000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000002'
    )
    order by id
  $$,
  array[0::numeric, 0::numeric],
  'merge reduces every source current weight to zero'
);

select is(
  (
    select count(*)
    from public.sub_batches
    where id in (
      '95000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000002'
    )
  ),
  2::bigint,
  'merge preserves source sub-batch rows'
);

select is(
  (
    select count(*)
    from public.tests
    where id = '97000000-0000-0000-0000-000000000001'
      and sub_batch_id = '95000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'merge preserves quality tests on their source sub-batches'
);

select is(
  (
    select count(*)
    from public.batch_weight_adjustments
    where sub_batch_id = '95000000-0000-0000-0000-000000000001'
      and reason = 'Historical source correction'
      and weight_grams = -0.25
  ),
  1::bigint,
  'merge preserves existing source weight-adjustment history'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where id in (
      '96000000-0000-0000-0000-000000000001',
      '96000000-0000-0000-0000-000000000002'
    )
      and moved_out_at is not null
  ),
  2::bigint,
  'merge preserves and closes source storage rows'
);

select is(
  (
    select count(distinct moved_out_at)
    from public.batch_storage
    where id in (
      '96000000-0000-0000-0000-000000000001',
      '96000000-0000-0000-0000-000000000002'
    )
  ),
  1::bigint,
  'all source storage rows close at the same time'
);

select is(
  (
    select sb.weight_grams
    from public.sub_batches sb
    join merge_result result on result.id = sb.id
    where sb.container_id = '93000000-0000-0000-0000-000000000003'
      and sb.notes = 'Successful container-aware merge'
  ),
  159.75::numeric,
  'destination sub-batch has the summed weight and selected container'
);

select is(
  (
    select count(*)
    from public.batch_storage storage
    join merge_result result on result.id = storage.sub_batch_id
    where storage.location_id = '94000000-0000-0000-0000-000000000003'
      and storage.moved_out_at is null
  ),
  1::bigint,
  'destination has one open row at the selected storage location'
);

select is(
  (
    select count(*)
    from public.tests test
    join merge_result result on result.id = test.sub_batch_id
  ),
  0::bigint,
  'destination does not inherit a source quality test'
);

set local role authenticated;

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000000003'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000003',
      '94000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'Sub-batches to merge must be distinct',
  'duplicate source IDs are rejected'
);

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000009999'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000003',
      '94000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'One or more sub-batches were not found',
  'missing source IDs are rejected'
);

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000000005'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000003',
      '94000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'All sub-batches must belong to the same batch',
  'sources from different batches are rejected'
);

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000006',
        '95000000-0000-0000-0000-000000000007'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000003',
      '94000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  -- Merging is gated on who holds the bags, not who owns the parent batch, so
  -- the refusal now names the bags rather than the batch.
  'Permission denied: not the current holder of these bags',
  'sources outside the caller custody are rejected'
);

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000000004'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000006',
      '94000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'Invalid or inactive storage container 93000000-0000-0000-0000-000000000006',
  'another organisation container is rejected'
);

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000000004'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000003',
      '94000000-0000-0000-0000-000000000004'
    )
  $$,
  'P0001',
  'Invalid storage location 94000000-0000-0000-0000-000000000004',
  'another organisation storage location is rejected'
);

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000000004'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000004',
      '94000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'Invalid or inactive storage container 93000000-0000-0000-0000-000000000004',
  'inactive destination container is rejected'
);

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000000004'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000005',
      '94000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'Invalid or inactive storage container 93000000-0000-0000-0000-000000000005',
  'collection-purpose destination container is rejected'
);

select throws_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000000008'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000003',
      '94000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'Every source sub-batch must have a positive current weight',
  'zero-weight sources are rejected'
);

reset role;

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = '95000000-0000-0000-0000-000000000003'
  ),
  10::numeric,
  'rejected calls leave source weight unchanged'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id in (
      '95000000-0000-0000-0000-000000000003',
      '95000000-0000-0000-0000-000000000004'
    )
      and moved_out_at is not null
  ),
  0::bigint,
  'rejected calls do not close source storage'
);

set local role authenticated;

select lives_ok(
  $$
    insert into optional_merge_result (id)
    select public.fn_merge_sub_batches(
      array[
        '95000000-0000-0000-0000-000000000003',
        '95000000-0000-0000-0000-000000000004'
      ]::uuid[],
      '93000000-0000-0000-0000-000000000003'
    )
  $$,
  'sub-batches can be merged without a destination storage location'
);

reset role;

select is(
  (
    select sb.weight_grams
    from public.sub_batches sb
    join optional_merge_result result on result.id = sb.id
    where sb.container_id = '93000000-0000-0000-0000-000000000003'
  ),
  30::numeric,
  'unstored merge destination has the summed weight and selected container'
);

select is(
  (
    select count(*)
    from public.batch_storage storage
    join optional_merge_result result on result.id = storage.sub_batch_id
  ),
  0::bigint,
  'unstored merge destination has no batch_storage row'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name = 'fn_merge_sub_batches'
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'PUBLIC cannot execute fn_merge_sub_batches'
);

select * from finish();

rollback;
