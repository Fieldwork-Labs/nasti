begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into public.organisation (id, name, owner_id)
values (
  'b1000000-0000-0000-0000-000000000001',
  'Container lifecycle other organisation',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
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
    'b3000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Used collection lifecycle container',
    'collection',
    true
  ),
  (
    'b3000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Used storage lifecycle container',
    'storage',
    true
  ),
  (
    'b3000000-0000-0000-0000-000000000003',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'Unused lifecycle container',
    'collection',
    true
  ),
  (
    'b3000000-0000-0000-0000-000000000004',
    'b1000000-0000-0000-0000-000000000001',
    'Other organisation lifecycle container',
    'storage',
    true
  );

insert into public.collection_containers (
  collection_id,
  container_id,
  amount
)
select
  collection.id,
  'b3000000-0000-0000-0000-000000000001',
  1
from public.collection collection
where collection.organisation_id =
  '02aba5b9-6c46-406d-831a-4f51851599f2'
order by collection.created_at, collection.id
limit 1;

insert into public.batches (id, organisation_id, code)
values (
  'b2000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2',
  'CONTAINER-LIFECYCLE-TEST'
);

insert into public.batch_custody (batch_id, organisation_id)
values (
  'b2000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2'
);

insert into public.sub_batches (
  id,
  batch_id,
  weight_grams,
  container_id
)
values (
  'b5000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',
  100,
  'b3000000-0000-0000-0000-000000000002'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select collection_count
    from public.fn_get_container_usage()
    where container_id = 'b3000000-0000-0000-0000-000000000001'
  $$,
  array[1::bigint],
  'usage reports collection references separately'
);

select results_eq(
  $$
    select storage_sub_batch_count
    from public.fn_get_container_usage()
    where container_id = 'b3000000-0000-0000-0000-000000000002'
  $$,
  array[1::bigint],
  'usage reports storage sub-batch references separately'
);

select results_eq(
  $$
    select collection_count, storage_sub_batch_count
    from public.fn_get_container_usage()
    where container_id = 'b3000000-0000-0000-0000-000000000003'
  $$,
  $$ values (0::bigint, 0::bigint) $$,
  'unused containers report zero usage'
);

select results_eq(
  $$
    select count(*)::integer
    from public.fn_get_container_usage()
    where container_id = 'b3000000-0000-0000-0000-000000000004'
  $$,
  array[0],
  'usage omits another organisation containers'
);

select throws_ok(
  $$
    update public.containers
    set purpose = 'storage'
    where id = 'b3000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  'Container purpose cannot be changed after creation',
  'a used collection container purpose cannot change'
);

select throws_ok(
  $$
    update public.containers
    set purpose = 'collection'
    where id = 'b3000000-0000-0000-0000-000000000002'
  $$,
  '23514',
  'Container purpose cannot be changed after creation',
  'a used storage container purpose cannot change'
);

select throws_ok(
  $$
    update public.containers
    set purpose = 'storage'
    where id = 'b3000000-0000-0000-0000-000000000003'
  $$,
  '23514',
  'Container purpose cannot be changed after creation',
  'an unused container purpose also cannot change'
);

select lives_ok(
  $$
    update public.containers
    set name = 'Renamed used collection lifecycle container',
        active = false
    where id = 'b3000000-0000-0000-0000-000000000001'
  $$,
  'used containers can still be renamed or deactivated'
);

select lives_ok(
  $$
    update public.containers
    set purpose = 'collection'
    where id = 'b3000000-0000-0000-0000-000000000001'
  $$,
  'writing the unchanged purpose remains valid'
);

reset role;

select is(
  (
    select purpose::text
    from public.containers
    where id = 'b3000000-0000-0000-0000-000000000001'
  ),
  'collection',
  'rejected collection purpose change leaves purpose unchanged'
);

select is(
  (
    select purpose::text
    from public.containers
    where id = 'b3000000-0000-0000-0000-000000000002'
  ),
  'storage',
  'rejected storage purpose change leaves purpose unchanged'
);

select is(
  (
    select purpose::text
    from public.containers
    where id = 'b3000000-0000-0000-0000-000000000003'
  ),
  'collection',
  'unused container purpose remains unchanged'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'fn_get_container_usage',
        'prevent_container_purpose_change'
      )
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'PUBLIC cannot execute container lifecycle functions'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name = 'fn_get_container_usage'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  $$,
  array[1],
  'authenticated users can query their container usage'
);

select * from finish();

rollback;
