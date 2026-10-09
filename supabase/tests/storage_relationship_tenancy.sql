begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select results_eq(
  $$
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.sub_batches'::regclass
      and tgname = 'sub_batches_storage_container_relationship'
      and not tgisinternal
  $$,
  array[1],
  'sub-batches validate storage container relationships'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.batch_storage'::regclass
      and tgname = 'batch_storage_active_location'
      and not tgisinternal
  $$,
  array[1],
  'batch storage validates location relationships'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_proc procedure
    inner join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'validate_sub_batch_storage_container',
        'validate_active_storage_location'
      )
      and procedure.prosecdef
  $$,
  array[2],
  'relationship validators can inspect catalogue rows regardless of caller RLS'
);

insert into public.organisation (id, name, owner_id)
values (
  'a1000000-0000-0000-0000-000000000001',
  'Storage relationship other organisation',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

insert into public.batches (id, organisation_id, code)
values (
  'a2000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2',
  'STORAGE-RELATIONSHIP-TEST'
);

insert into public.batch_custody (batch_id, organisation_id)
values (
  'a2000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2'
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
    'a3000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Valid relationship storage bag',
    'storage',
    true
  ),
  (
    'a3000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'Other organisation storage bag',
    'storage',
    true
  ),
  (
    'a3000000-0000-0000-0000-000000000003',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Collection-purpose relationship bag',
    'collection',
    true
  ),
  (
    'a3000000-0000-0000-0000-000000000004',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Inactive relationship storage bag',
    'storage',
    false
  );

insert into public.storage_locations (
  id,
  organisation_id,
  name,
  active
)
values
  (
    'a4000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Valid relationship shelf',
    true
  ),
  (
    'a4000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'Other organisation relationship shelf',
    true
  ),
  (
    'a4000000-0000-0000-0000-000000000003',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Inactive relationship shelf',
    false
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into public.sub_batches (
      id,
      batch_id,
      weight_grams,
      container_id
    )
    values (
      'a5000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001',
      100,
      'a3000000-0000-0000-0000-000000000001'
    )
  $$,
  'a direct write can use the custodian active storage container'
);

select is(
  (
    select container_id
    from public.sub_batches
    where id = 'a5000000-0000-0000-0000-000000000001'
  ),
  'a3000000-0000-0000-0000-000000000001'::uuid,
  'the valid storage container relationship is persisted'
);

select throws_ok(
  $$
    insert into public.sub_batches (
      id,
      batch_id,
      weight_grams,
      container_id
    )
    values (
      'a5000000-0000-0000-0000-000000000003',
      'a2000000-0000-0000-0000-000000000001',
      25,
      'a3000000-0000-0000-0000-000000000002'
    )
  $$,
  '23514',
  'Storage container is inactive, invalid, or belongs to another organisation',
  'a direct write cannot use another organisation container'
);

select throws_ok(
  $$
    insert into public.sub_batches (
      id,
      batch_id,
      weight_grams,
      container_id
    )
    values (
      'a5000000-0000-0000-0000-000000000004',
      'a2000000-0000-0000-0000-000000000001',
      25,
      'a3000000-0000-0000-0000-000000000003'
    )
  $$,
  '23514',
  'Storage container is inactive, invalid, or belongs to another organisation',
  'a collection-purpose container cannot be assigned to a sub-batch'
);

select throws_ok(
  $$
    insert into public.sub_batches (
      id,
      batch_id,
      weight_grams,
      container_id
    )
    values (
      'a5000000-0000-0000-0000-000000000005',
      'a2000000-0000-0000-0000-000000000001',
      25,
      'a3000000-0000-0000-0000-000000000004'
    )
  $$,
  '23514',
  'Storage container is inactive, invalid, or belongs to another organisation',
  'an inactive storage container cannot be assigned to a sub-batch'
);

select lives_ok(
  $$
    insert into public.sub_batches (
      id,
      batch_id,
      weight_grams
    )
    values (
      'a5000000-0000-0000-0000-000000000002',
      'a2000000-0000-0000-0000-000000000001',
      50
    )
  $$,
  'a sub-batch may still be recorded without a container'
);

select lives_ok(
  $$
    insert into public.batch_storage (
      id,
      batch_id,
      sub_batch_id,
      location_id
    )
    values (
      'a6000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001'
    )
  $$,
  'a direct write can use the custodian active storage location'
);

select throws_ok(
  $$
    insert into public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id
    )
    values (
      'a2000000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000002',
      'a4000000-0000-0000-0000-000000000002'
    )
  $$,
  '23514',
  'Storage location belongs to another organisation',
  'a direct write cannot use another organisation storage location'
);

select throws_ok(
  $$
    insert into public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id
    )
    values (
      'a2000000-0000-0000-0000-000000000001',
      'a5000000-0000-0000-0000-000000000002',
      'a4000000-0000-0000-0000-000000000003'
    )
  $$,
  '23514',
  'Storage location is inactive or does not exist',
  'an inactive storage location cannot be assigned directly'
);

select throws_ok(
  $$
    update public.sub_batches
    set container_id = 'a3000000-0000-0000-0000-000000000002'
    where id = 'a5000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  'Storage container is inactive, invalid, or belongs to another organisation',
  'an existing sub-batch cannot be moved to another organisation container'
);

select throws_ok(
  $$
    update public.batch_storage
    set location_id = 'a4000000-0000-0000-0000-000000000002'
    where id = 'a6000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  'Storage location belongs to another organisation',
  'an existing storage row cannot move to another organisation location'
);

reset role;

select is(
  (
    select count(*)
    from public.sub_batches
    where batch_id = 'a2000000-0000-0000-0000-000000000001'
      and container_id <> 'a3000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'rejected container writes leave no invalid relationship'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where batch_id = 'a2000000-0000-0000-0000-000000000001'
      and location_id <> 'a4000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'rejected location writes leave no invalid relationship'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'validate_sub_batch_storage_container',
        'validate_active_storage_location'
      )
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'PUBLIC cannot execute relationship validator functions'
);

select * from finish();

rollback;
