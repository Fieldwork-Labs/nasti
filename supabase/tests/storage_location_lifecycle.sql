begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_column(
  'public',
  'storage_locations',
  'active',
  'storage locations record whether they accept new assignments'
);

select col_not_null(
  'public',
  'storage_locations',
  'active',
  'storage location active state is always defined'
);

select results_eq(
  $$
    select confdeltype::text
    from pg_constraint
    where conrelid = 'public.batch_storage'::regclass
      and conname = 'batch_storage_location_id_fkey'
  $$,
  array['r'],
  'storage history restricts deletion of referenced locations'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'storage_locations'
      and policyname = 'storage_locations_update'
      and 'authenticated' = any(roles)
  $$,
  array[1],
  'authenticated organisation admins have an update policy'
);

insert into public.organisation (id, name, owner_id)
values (
  '81000000-0000-0000-0000-000000000001',
  'Storage lifecycle other organisation',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

insert into public.batches (id, organisation_id, code)
values (
  '82000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2',
  'STORAGE-LIFECYCLE-TEST'
);

insert into public.batch_custody (batch_id, organisation_id)
values (
  '82000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2'
);

insert into public.sub_batches (id, batch_id, weight_grams, notes)
values
  (
    '83000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    100,
    'Currently stored lifecycle fixture'
  ),
  (
    '83000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000001',
    50,
    'Unstored lifecycle fixture'
  );

insert into public.storage_locations (id, organisation_id, name)
values
  (
    '84000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Referenced lifecycle shelf'
  ),
  (
    '84000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Unused lifecycle shelf'
  ),
  (
    '84000000-0000-0000-0000-000000000003',
    '81000000-0000-0000-0000-000000000001',
    'Other organisation lifecycle shelf'
  );

insert into public.batch_storage (
  batch_id,
  sub_batch_id,
  location_id,
  stored_at,
  notes
)
values (
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  '84000000-0000-0000-0000-000000000001',
  '2026-07-28 08:00:00+00',
  'History that must survive retirement'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select is(
  public.fn_remove_storage_location(
    '84000000-0000-0000-0000-000000000001'
  ),
  'retired',
  'removing a referenced location retires it'
);

reset role;

select is(
  (
    select active
    from public.storage_locations
    where id = '84000000-0000-0000-0000-000000000001'
  ),
  false,
  'a retired location is marked inactive'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where location_id = '84000000-0000-0000-0000-000000000001'
      and notes = 'History that must survive retirement'
  ),
  1::bigint,
  'retirement preserves storage history'
);

select is(
  (
    select count(*)
    from public.current_batch_storage
    where location_id = '84000000-0000-0000-0000-000000000001'
      and sub_batch_id = '83000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'an occupied retired location remains visible as current storage'
);

set local role authenticated;

select throws_ok(
  $$
    select public.fn_set_sub_batch_storage(
      '83000000-0000-0000-0000-000000000002',
      '84000000-0000-0000-0000-000000000001',
      '2026-07-28 09:00:00+00'
    )
  $$,
  '23514',
  'Storage location is inactive or does not exist',
  'retired locations reject new storage assignments'
);

select lives_ok(
  $$
    update public.storage_locations
    set active = true
    where id = '84000000-0000-0000-0000-000000000001'
  $$,
  'an organisation admin can reactivate a retired location'
);

reset role;

select is(
  (
    select active
    from public.storage_locations
    where id = '84000000-0000-0000-0000-000000000001'
  ),
  true,
  'reactivation makes the location active again'
);

set local role authenticated;

select is(
  public.fn_remove_storage_location(
    '84000000-0000-0000-0000-000000000002'
  ),
  'deleted',
  'removing a never-used location deletes it'
);

reset role;

select is(
  (
    select count(*)
    from public.storage_locations
    where id = '84000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'a deleted unused location no longer exists'
);

set local role authenticated;

select throws_ok(
  $$
    select public.fn_remove_storage_location(
      '84000000-0000-0000-0000-000000000003'
    )
  $$,
  'P0001',
  'Permission denied: organisation admin required',
  'an admin cannot remove another organisation storage location'
);

reset role;

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name = 'fn_remove_storage_location'
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'PUBLIC cannot execute fn_remove_storage_location'
);

select * from finish();

rollback;
