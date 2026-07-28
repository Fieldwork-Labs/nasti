begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_index(
  'public',
  'batch_storage',
  'batch_storage_one_open_row_per_sub_batch_idx',
  'batch_storage enforces one open row per sub-batch'
);

insert into public.organisation (id, name, owner_id)
values (
  '71000000-0000-0000-0000-000000000001',
  'Storage transition other organisation',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

insert into public.batches (id, organisation_id, code)
values (
  '72000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2',
  'STORAGE-TRANSITION-TEST'
);

insert into public.batch_custody (batch_id, organisation_id)
values (
  '72000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2'
);

insert into public.sub_batches (id, batch_id, weight_grams, notes)
values
  (
    '73000000-0000-0000-0000-000000000001',
    '72000000-0000-0000-0000-000000000001',
    100,
    'Storage transition source'
  ),
  (
    '73000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000001',
    5,
    'Zero-weight storage source'
  );

insert into public.batch_weight_adjustments (
  sub_batch_id,
  weight_grams,
  reason,
  created_by
)
values (
  '73000000-0000-0000-0000-000000000002',
  -5,
  'Prepare zero-weight storage fixture',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

insert into public.storage_locations (id, organisation_id, name)
values
  (
    '74000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Storage transition shelf'
  ),
  (
    '74000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Storage transition cool room'
  ),
  (
    '74000000-0000-0000-0000-000000000003',
    '71000000-0000-0000-0000-000000000001',
    'Other organisation storage'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      '2026-07-28 08:00:00+00',
      'Initial shelf storage'
    )
  $$,
  'an unstored sub-batch can be stored'
);

reset role;

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = '73000000-0000-0000-0000-000000000001'
      and location_id = '74000000-0000-0000-0000-000000000001'
      and stored_at = '2026-07-28 08:00:00+00'
      and notes = 'Initial shelf storage'
      and moved_out_at is null
  ),
  1::bigint,
  'store creates the expected open history row'
);

set local role authenticated;

select lives_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000002',
      '2026-07-28 09:00:00+00',
      'Moved into cool room'
    )
  $$,
  'a stored sub-batch can be moved atomically'
);

reset role;

select is(
  (
    select moved_out_at
    from public.batch_storage
    where sub_batch_id = '73000000-0000-0000-0000-000000000001'
      and location_id = '74000000-0000-0000-0000-000000000001'
  ),
  '2026-07-28 09:00:00+00'::timestamptz,
  'move closes the previous row at the selected effective time'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = '73000000-0000-0000-0000-000000000001'
      and location_id = '74000000-0000-0000-0000-000000000002'
      and stored_at = '2026-07-28 09:00:00+00'
      and notes = 'Moved into cool room'
      and moved_out_at is null
  ),
  1::bigint,
  'move opens the destination row at the same effective time'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = '73000000-0000-0000-0000-000000000001'
      and moved_out_at is null
  ),
  1::bigint,
  'move leaves exactly one open storage row'
);

set local role authenticated;

select throws_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000002',
      '2026-07-28 10:00:00+00'
    )
  $$,
  'P0001',
  'Sub-batch is already stored at this location',
  'moving to the current location is rejected'
);

select throws_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000003',
      '2026-07-28 10:00:00+00'
    )
  $$,
  'P0001',
  'Invalid storage location 74000000-0000-0000-0000-000000000003',
  'another organisation storage location is rejected'
);

select throws_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '73000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      '2026-07-28 07:00:00+00'
    )
  $$,
  'P0001',
  'Effective storage time cannot be before the current storage start',
  'a move cannot predate the current storage period'
);

reset role;

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = '73000000-0000-0000-0000-000000000001'
      and location_id = '74000000-0000-0000-0000-000000000002'
      and moved_out_at is null
  ),
  1::bigint,
  'rejected transitions leave current storage unchanged'
);

set local role authenticated;

select lives_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '73000000-0000-0000-0000-000000000001',
      null,
      '2026-07-28 10:00:00+00',
      'Removed for processing'
    )
  $$,
  'a sub-batch can be removed from storage atomically'
);

reset role;

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = '73000000-0000-0000-0000-000000000001'
      and moved_out_at is null
  ),
  0::bigint,
  'remove leaves no open storage row'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = '73000000-0000-0000-0000-000000000001'
      and location_id = '74000000-0000-0000-0000-000000000002'
      and moved_out_at = '2026-07-28 10:00:00+00'
      and notes = 'Removed for processing'
  ),
  1::bigint,
  'remove overwrites notes and closes the current row at the effective time'
);

set local role authenticated;

select throws_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '73000000-0000-0000-0000-000000000001',
      null,
      '2026-07-28 11:00:00+00'
    )
  $$,
  'P0001',
  'Sub-batch is not currently stored',
  'removing an unstored sub-batch is rejected'
);

select throws_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '73000000-0000-0000-0000-000000000002',
      '74000000-0000-0000-0000-000000000001',
      '2026-07-28 11:00:00+00'
    )
  $$,
  'P0001',
  'Only a positive-weight sub-batch can be stored',
  'zero-weight sub-batches cannot be stored'
);

reset role;

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name = 'fn_set_sub_batch_storage'
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'PUBLIC cannot execute fn_set_sub_batch_storage'
);

select * from finish();

rollback;
