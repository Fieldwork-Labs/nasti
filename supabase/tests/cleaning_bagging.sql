begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into public.batches (id, organisation_id, code, weight_grams)
values (
  '81000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2',
  'OPTIONAL-LOCATION-OUTPUT',
  50
);

insert into public.batch_custody (batch_id, organisation_id)
values (
  '81000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2'
);

insert into public.batch_cleaning (
  id,
  is_cleaned,
  duration,
  organisation_id,
  created_by
)
values (
  '82000000-0000-0000-0000-000000000001',
  true,
  interval '1 hour',
  '02aba5b9-6c46-406d-831a-4f51851599f2',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

insert into public.batch_cleaning_output (
  cleaning_id,
  output_batch_id,
  quality,
  material_type,
  weight_grams
)
values (
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  'HQ',
  'seed',
  50
);

insert into public.containers (
  id,
  organisation_id,
  name,
  purpose,
  active
)
values (
  '83000000-0000-0000-0000-000000000001',
  '02aba5b9-6c46-406d-831a-4f51851599f2',
  'Optional location test envelope',
  'storage',
  true
);

insert into public.sub_batches (
  id,
  batch_id,
  weight_grams,
  notes
)
values (
  '84000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  50,
  'Initial sub-batch from cleaning'
);

create temporary table bagging_result (id uuid);
grant insert, select on bagging_result to authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into bagging_result (id)
    select unnest(public.fn_bag_and_store_cleaning_outputs(
      '82000000-0000-0000-0000-000000000001',
      '[
        {
          "output_batch_id": "81000000-0000-0000-0000-000000000001",
          "containers": [
            {
              "container_id": "83000000-0000-0000-0000-000000000001",
              "quantity": 2,
              "weight_grams": 25
            }
          ]
        }
      ]'::jsonb
    ))
  $$,
  'cleaning output can be bagged without a storage location'
);

reset role;

select is(
  (
    select count(*)
    from public.sub_batches
    where batch_id = '81000000-0000-0000-0000-000000000001'
      and container_id = '83000000-0000-0000-0000-000000000001'
      and weight_grams = 25
  ),
  2::bigint,
  'one physical sub-batch is created per container'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where batch_id = '81000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'no storage rows are created when location is omitted'
);

select is(
  (
    select count(*)
    from public.sub_batches sb
    join bagging_result result on result.id = sb.id
  ),
  2::bigint,
  'the RPC returns every unstored sub-batch it creates'
);

select * from finish();

rollback;
