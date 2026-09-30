begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

-- The seeded admin, in the seeded organisation, is the caller throughout.
insert into public.organisation (id, name, owner_id)
values (
  'c2000000-0000-0000-0000-000000000001',
  'Batch combine test other organisation',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

insert into public.species (id, name, organisation_id)
values
  (
    'c1000000-0000-0000-0000-000000000001',
    'Batch combine fixture species A',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  ),
  (
    'c1000000-0000-0000-0000-000000000002',
    'Batch combine fixture species B',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  );

-- Two points that resolve to different IBRA regions (taken from the seeded
-- collections), and one in the ocean that resolves to none.
create temporary table fixture_point (name text, location public.geography);
insert into fixture_point (name, location)
values
  ('a', '0101000020E6100000508D976E12635E40D50968226CA83FC0'::public.geography),
  ('b', '0101000020E61000006DE7FBA9F1A25D4085EB51B81E1540C0'::public.geography),
  ('ocean', 'SRID=4326;POINT(0 0)'::public.geography);

-- Collections 1-3 are the ones that get combined. The earliest year (25) and,
-- within it, the first number (1) belong to the last one inserted, so the
-- expected code is neither the first collection's nor the highest-numbered.
insert into public.collection (
  id,
  species_id,
  organisation_id,
  collected_by,
  collected_on,
  code,
  location,
  created_at
)
select
  ('c3000000-0000-0000-0000-' || lpad(fixture.n::text, 12, '0'))::uuid,
  fixture.species_id,
  fixture.organisation_id,
  'e18b3927-87a9-4dcc-8d59-148461504a02',
  current_date,
  fixture.code,
  (select p.location from fixture_point p where p.name = fixture.point_name),
  fixture.created_at
from (
  values
    (1, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.AAA.26-2',  'a',     '2026-03-01 00:00:00+00'::timestamptz),
    (2, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.AAA.25-3',  'a',     '2025-05-01 00:00:00+00'::timestamptz),
    (3, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.AAA.25-1',  'a',     '2025-02-01 00:00:00+00'::timestamptz),
    (4, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.AAA.26-4',  'a',     '2026-04-01 00:00:00+00'::timestamptz),
    (5, 'c1000000-0000-0000-0000-000000000002'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.BBB.26-1',  'a',     '2026-04-02 00:00:00+00'::timestamptz),
    (6, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.AAA.26-5',  'a',     '2026-04-03 00:00:00+00'::timestamptz),
    (7, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.CCC.26-6',  'b',     '2026-04-04 00:00:00+00'::timestamptz),
    (8, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.AAA.26-7',  'a',     '2026-04-05 00:00:00+00'::timestamptz),
    (9, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.AAA.26-8',  'a',     '2026-04-06 00:00:00+00'::timestamptz),
    (10, 'c1000000-0000-0000-0000-000000000001'::uuid, 'c2000000-0000-0000-0000-000000000001'::uuid, 'CMBTST-OTHER.AAA.26-1', 'a',   '2026-04-07 00:00:00+00'::timestamptz),
    (11, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.UNK.26-9',  'ocean', '2026-04-08 00:00:00+00'::timestamptz),
    (12, 'c1000000-0000-0000-0000-000000000001'::uuid, '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid, 'CMBTST-CO.AAA.26-10', 'a',     '2026-04-09 00:00:00+00'::timestamptz)
) as fixture (n, species_id, organisation_id, code, point_name, created_at);

-- Inserting a collection creates its origin batch: the unprocessed batch that
-- combining works on.
create temporary table origin_batch as
select collection_id, id as batch_id
from public.batches
where collection_id::text like 'c3000000-%';

create function pg_temp.origin(n integer)
returns uuid
language sql
as $$
  select batch_id
  from origin_batch
  where collection_id = ('c3000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- A cleaned batch has weight; give collection 8's batch one.
update public.batches
set weight_grams = 10
where id = pg_temp.origin(8);

create temporary table combo (name text, ids uuid[]);
insert into combo (name, ids)
values
  ('happy',     array[pg_temp.origin(1), pg_temp.origin(2), pg_temp.origin(3)]),
  ('single',    array[pg_temp.origin(4)]),
  ('duplicate', array[pg_temp.origin(4), pg_temp.origin(4)]),
  ('species',   array[pg_temp.origin(4), pg_temp.origin(5)]),
  ('ibra',      array[pg_temp.origin(6), pg_temp.origin(7)]),
  ('unknown',   array[pg_temp.origin(11), pg_temp.origin(12)]),
  ('weighted',  array[pg_temp.origin(8), pg_temp.origin(9)]),
  ('consumed',  array[pg_temp.origin(1), pg_temp.origin(9)]),
  ('other_org', array[pg_temp.origin(9), pg_temp.origin(10)]),
  ('missing',   array[pg_temp.origin(9), 'c9000000-0000-0000-0000-000000000000'::uuid]);

create temporary table combine_result (id uuid);
create temporary table clean_result (label text, id uuid);
grant select on origin_batch, combo to authenticated;
grant insert, select on combine_result, clean_result to authenticated;

select has_function(
  'public',
  'fn_combine_batches',
  array['uuid[]', 'text'],
  'a dedicated combine function exists, separate from fn_mix_batches'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name = 'fn_combine_batches'
      and grantee = 'anon'
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'anonymous callers cannot execute fn_combine_batches'
);

select ok(
  public.get_ibra_code_from_location((select location from fixture_point where name = 'a')) <> 'UNK'
    and public.get_ibra_code_from_location((select location from fixture_point where name = 'b')) <> 'UNK'
    and public.get_ibra_code_from_location((select location from fixture_point where name = 'a'))
      <> public.get_ibra_code_from_location((select location from fixture_point where name = 'b'))
    and public.get_ibra_code_from_location((select location from fixture_point where name = 'ocean')) = 'UNK',
  'fixture points resolve to two different IBRA regions and one unknown'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into combine_result (id)
    select public.fn_combine_batches(
      (select ids from combo where name = 'happy'),
      'Combined for test'
    )
  $$,
  'unprocessed batches of one species and IBRA region can be combined'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'single')) $$,
  'P0001',
  'Provide at least two source batches to combine',
  'a single batch cannot be combined'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'duplicate')) $$,
  'P0001',
  'Each source batch can only be combined once',
  'a batch cannot be combined with itself'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'species')) $$,
  'P0001',
  'All batches must be of the same species to combine',
  'batches of different species are refused'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'ibra')) $$,
  'P0001',
  'All batches must be from the same IBRA region to combine',
  'batches from different IBRA regions are refused'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'unknown')) $$,
  'P0001',
  'Cannot combine a batch whose IBRA region is unknown',
  'a batch whose region cannot be resolved is refused rather than matched'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'weighted')) $$,
  'P0001',
  'Only batches that have not been cleaned can be combined',
  'a batch that already has weight is refused'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'consumed')) $$,
  'P0001',
  'A source batch has already been combined or merged into another batch',
  'a batch already consumed by an earlier combine is refused'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'other_org')) $$,
  'P0001',
  'Permission denied: not a member of the organisation that holds every source batch',
  'another organisation''s batch cannot be combined'
);

select throws_ok(
  $$ select public.fn_combine_batches((select ids from combo where name = 'missing')) $$,
  'P0001',
  'Permission denied: not a member of the organisation that holds every source batch',
  'an id that is not a batch is refused without saying whether it exists'
);

reset role;

select is(
  (select code from public.batches where id = (select id from combine_result)),
  'CMBTST-CO.AAA.25-1',
  'the combined batch takes the earliest year and, within it, the first number'
);

select ok(
  (
    select weight_grams is null and collection_id is null
    from public.batches
    where id = (select id from combine_result)
  ),
  'the combined batch is unprocessed: no weight, and no single collection'
);

select is(
  (select notes from public.batches where id = (select id from combine_result)),
  'Combined for test',
  'notes are kept on the combined batch'
);

select is(
  (
    select organisation_id
    from public.current_batch_custody
    where batch_id = (select id from combine_result)
  ),
  '02aba5b9-6c46-406d-831a-4f51851599f2'::uuid,
  'the combined batch is in the callers custody'
);

select is(
  (
    select count(*)
    from public.sub_batches
    where batch_id = (select id from combine_result)
  ),
  0::bigint,
  'the combined batch has no bags until it is cleaned'
);

select is(
  (
    select count(*)
    from public.batch_merges
    where merged_batch_id = (select id from combine_result)
      and source_batch_id = any ((select ids from combo where name = 'happy'))
  ),
  3::bigint,
  'every source is recorded against the combined batch'
);

select is(
  (
    select count(*)
    from public.batch_current_weight
    where id = any ((select ids from combo where name = 'happy'))
      and current_weight = 0
  ),
  3::bigint,
  'the sources are consumed'
);

select is(
  (
    select count(*)
    from public.active_batches
    where id = (select id from combine_result)
  ),
  1::bigint,
  'the combined batch is an active batch'
);

select is(
  (
    select count(*)
    from public.active_batches
    where id = any ((select ids from combo where name = 'happy'))
  ),
  0::bigint,
  'the sources are no longer active batches'
);

select is(
  (select created_at from public.batches where id = (select id from combine_result)),
  '2025-02-01 00:00:00+00'::timestamptz,
  'the combined batch is dated from the oldest collection'
);

select is(
  (
    select count(*)
    from public.batches
    where collection_id is null
      and code like 'CMBTST-%'
  ),
  1::bigint,
  'refused combines create nothing'
);

-- Cleaning: a combined batch has no collection to number its outputs from or to
-- take their species from, so it does both itself.
select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into clean_result (label, id)
    select 'combined', public.fn_clean_batch(
      (select id from combine_result),
      interval '1 hour',
      'seed',
      null,
      null,
      true,
      'Cleaning a combined batch',
      '{}'::uuid[],
      '[
        {"quality": "HQ", "material_type": "seed", "weight_grams": 60},
        {"quality": "LQ", "material_type": "seed", "weight_grams": 10}
      ]'::jsonb
    )
  $$,
  'a combined batch can be cleaned'
);

select lives_ok(
  $$
    insert into clean_result (label, id)
    select 'ordinary', public.fn_clean_batch(
      (select batch_id from origin_batch where collection_id = 'c3000000-0000-0000-0000-000000000009'),
      interval '1 hour',
      'seed',
      null,
      null,
      true,
      'Cleaning a batch that has a collection',
      '{}'::uuid[],
      '[{"quality": "HQ", "material_type": "seed", "weight_grams": 5}]'::jsonb
    )
  $$,
  'a batch with a collection can still be cleaned'
);

reset role;

select is(
  (select species_id from public.batches where id = (select id from combine_result)),
  'c1000000-0000-0000-0000-000000000001'::uuid,
  'the combined batch records the species it was combined as'
);

select results_eq(
  $$
    select b.code
    from public.batch_cleaning_output o
    join public.batches b on b.id = o.output_batch_id
    where o.cleaning_id = (select id from clean_result where label = 'combined')
    order by b.code
  $$,
  array['CMBTST-CO.AAA.25-1-HQ-1', 'CMBTST-CO.AAA.25-1-LQ-1'],
  'outputs of a combined batch are numbered from its own code'
);

select ok(
  (
    select bool_and(b.collection_id is null and b.species_id = 'c1000000-0000-0000-0000-000000000001')
    from public.batch_cleaning_output o
    join public.batches b on b.id = o.output_batch_id
    where o.cleaning_id = (select id from clean_result where label = 'combined')
  ),
  'outputs of a combined batch have no collection and carry the species'
);

select is(
  (
    select count(*)
    from public.batch_cleaning_output o
    join public.sub_batches sb on sb.batch_id = o.output_batch_id
    where o.cleaning_id = (select id from clean_result where label = 'combined')
  ),
  2::bigint,
  'each output of a combined batch gets its bag'
);

select results_eq(
  $$
    select code, species_name
    from public.active_batches
    where code like 'CMBTST-CO.AAA.25-1%'
    order by code
  $$,
  $$
    values
      ('CMBTST-CO.AAA.25-1-HQ-1', 'Batch combine fixture species A'),
      ('CMBTST-CO.AAA.25-1-LQ-1', 'Batch combine fixture species A')
  $$,
  'the inventory lists the outputs with their species, and no longer the cleaned combined batch'
);

select results_eq(
  $$
    select b.code, b.collection_id, b.species_id
    from public.batch_cleaning_output o
    join public.batches b on b.id = o.output_batch_id
    where o.cleaning_id = (select id from clean_result where label = 'ordinary')
  $$,
  $$
    values (
      'CMBTST-CO.AAA.26-8-HQ-1',
      'c3000000-0000-0000-0000-000000000009'::uuid,
      null::uuid
    )
  $$,
  'a batch with a collection still numbers from the collection code and takes its species from it'
);

select * from finish();

rollback;
