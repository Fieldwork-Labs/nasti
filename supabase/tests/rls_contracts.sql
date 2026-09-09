begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

select has_table(
  'public',
  'batch_storage',
  'batch_storage exists'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'batch_storage'
      and permissive = 'PERMISSIVE'
      and cmd in ('SELECT', 'INSERT', 'UPDATE')
  $$,
  array[3],
  'batch_storage has select, insert, and update policies'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_user'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  $$,
  array[0],
  'authenticated clients cannot mutate org_user directly'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invitation'
      and cmd in ('INSERT', 'ALL')
  $$,
  array[0],
  'authenticated clients cannot create invitations directly'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name = 'fn_create_quality_test'
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'PUBLIC cannot execute fn_create_quality_test'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name = 'fn_create_quality_test'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  $$,
  array[1],
  'authenticated can execute fn_create_quality_test'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'batch_storage'
      and column_name in ('batch_id', 'sub_batch_id')
      and is_nullable = 'NO'
  $$,
  array[2],
  'batch_storage requires both batch and sub-batch keys'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.batch_storage'::regclass
      and contype = 'f'
      and conname = 'batch_storage_sub_batch_matches_batch_fkey'
  $$,
  array[1],
  'batch_storage enforces matching batch and sub-batch keys'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'collection_photo'
      and policyname in ('collection_photo_update', 'collection_photo_delete')
      and qual like '%created_by%'
      and qual like '%auth_org_role%'
  $$,
  array[2],
  'collection photo mutations retain owner or Admin checks'
);

select ok(
  pg_get_functiondef(
    'public.is_current_custodian(uuid, uuid)'::regprocedure
  ) like '%is_active = true%',
  'current custody excludes inactive memberships'
);

select ok(
  pg_get_functiondef(
    'public.is_batch_custodian_or_past(uuid, uuid)'::regprocedure
  ) like '%is_active = true%',
  'historical custody excludes inactive memberships'
);

select results_eq(
  $$
    select count(*)::integer
    from public.person
    where organisation_id = '02aba5b9-6c46-406d-831a-4f51851599f2'
      and user_id = 'e18b3927-87a9-4dcc-8d59-148461504a02'
  $$,
  array[1],
  'seed creates the user person projection'
);

-- Asserted as an invariant rather than a row count: the seed grows, and a
-- hard-coded count goes stale every time a collection is added to it.
select ok(
  (
    select count(*)
    from public.collection
    where organisation_id = '02aba5b9-6c46-406d-831a-4f51851599f2'
  ) > 0
  and not exists (
    select 1
    from public.collection
    where organisation_id = '02aba5b9-6c46-406d-831a-4f51851599f2'
      and coalesce(cardinality(person_ids), 0) = 0
  ),
  'seeded collections identify their collector'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'containers'
      and permissive = 'PERMISSIVE'
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  $$,
  array[4],
  'containers has select, insert, update, and delete policies'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'collection_containers'
      and permissive = 'PERMISSIVE'
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  $$,
  array[4],
  'collection_containers has select, insert, update, and delete policies'
);

select results_eq(
  $$
    select count(*)::integer
    from public.collection_containers cc
    inner join public.collection c on c.id = cc.collection_id
    inner join public.containers ct on ct.id = cc.container_id
    where c.organisation_id <> ct.organisation_id
  $$,
  array[0],
  'no collection references another organisation''s container'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;
select lives_ok(
  'select * from public.active_batches',
  'authenticated active_batches query does not recurse'
);
reset role;

select * from finish();

rollback;
