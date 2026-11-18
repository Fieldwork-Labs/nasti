begin;

create extension if not exists pgtap with schema extensions;

select plan(70);

-- Ownership transfer, part two: what the recipient is shown (test selection and
-- projection, storage snapshots), onward transfer, cleaning a received batch,
-- forged provenance, and mixing or combining received seed. The lifecycle,
-- reservation, isolation, opt-out and visibility cases are in
-- ownership_transfer.sql.
--
-- Most assertions here run as the table owner with a caller's JWT claims set
-- ("as postgres, impersonating"): every function under test is SECURITY
-- DEFINER and reads auth.uid() and the claims, and it lets the assertions read
-- temporary tables. The checks that depend on the authenticated role itself
-- (direct writes to batches) switch role explicitly.
--
-- Fixture clock: now() is fixed for the whole test transaction, so storage
-- rows are inserted with explicit timestamps relative to now().

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'xfer-prov-a@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'xfer-prov-b@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'xfer-prov-c@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'xfer-prov-r@test.invalid');

insert into public.organisation (id, name, owner_id, is_testing_provider, accepts_transfers)
values
  ('7b000000-0000-0000-0000-000000000001', 'Xfer A prov', '7a000000-0000-0000-0000-000000000001', false, false),
  ('7b000000-0000-0000-0000-000000000002', 'Xfer B prov', '7a000000-0000-0000-0000-000000000002', false, true),
  ('7b000000-0000-0000-0000-000000000003', 'Xfer C prov', '7a000000-0000-0000-0000-000000000003', false, true),
  ('7b000000-0000-0000-0000-000000000004', 'Xfer R prov', '7a000000-0000-0000-0000-000000000004', false, true);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000002', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000003', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000004', '7a000000-0000-0000-0000-000000000004', 'Admin', true, '{}');

insert into public.species (id, name, organisation_id, ala_guid, indigenous_name)
values
  ('7c000000-0000-0000-0000-000000000001', 'Xfer Acacia testus', '7b000000-0000-0000-0000-000000000001', 'prov-guid-acacia', 'Wattle prov'),
  ('7c000000-0000-0000-0000-000000000002', 'Xfer B own species', '7b000000-0000-0000-0000-000000000002', null, null);

insert into public.collection (id, species_id, organisation_id, collected_by, collected_on, code, location, created_at)
values
  ('7d000000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', '2024-05-10', 'PROV-CA1-GEN', '0101000020E6100000508D976E12635E40D50968226CA83FC0'::public.geography, '2024-05-10 00:00:00+00'),
  ('7d000000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000002', '2022-02-02', 'PROV-CB1-GEN', '0101000020E6100000508D976E12635E40D50968226CA83FC0'::public.geography, '2022-02-02 00:00:00+00');

update public.collection set code = 'PROV-CA1' where id = '7d000000-0000-0000-0000-000000000001';
update public.collection set code = 'PROV-CB1' where id = '7d000000-0000-0000-0000-000000000002';

insert into public.storage_locations (id, organisation_id, name, active)
values
  ('79000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'Prov A shelf 1', true),
  ('79000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000001', 'Prov A shelf 2', true),
  ('79000000-0000-0000-0000-000000000003', '7b000000-0000-0000-0000-000000000001', 'Prov A shelf 3', true),
  ('79000000-0000-0000-0000-000000000004', '7b000000-0000-0000-0000-000000000002', 'Prov B shelf 1', true);

insert into public.batches (id, collection_id, organisation_id, code)
values
  ('7e000000-0000-0000-0000-000000000001', '7d000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'PROV-BT'),
  ('7e000000-0000-0000-0000-000000000002', '7d000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'PROV-BS1'),
  ('7e000000-0000-0000-0000-000000000003', '7d000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'PROV-BS2'),
  ('7e000000-0000-0000-0000-000000000004', '7d000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'PROV-BO'),
  ('7e000000-0000-0000-0000-000000000005', '7d000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'PROV-BC1'),
  ('7e000000-0000-0000-0000-000000000006', '7d000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'PROV-BM1'),
  ('7e000000-0000-0000-0000-000000000007', '7d000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'PROV-BM2'),
  ('7e000000-0000-0000-0000-000000000008', '7d000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000002', 'PROV-BB1'),
  ('7e000000-0000-0000-0000-000000000009', '7d000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000002', 'PROV-BB2');

insert into public.batch_custody (batch_id, organisation_id)
select b.id, b.organisation_id
from public.batches b
where b.id in (
  '7e000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000004', '7e000000-0000-0000-0000-000000000005',
  '7e000000-0000-0000-0000-000000000006', '7e000000-0000-0000-0000-000000000007', '7e000000-0000-0000-0000-000000000008', '7e000000-0000-0000-0000-000000000009'
);

insert into public.sub_batches (id, batch_id, weight_grams, notes)
values
  ('7f000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', 80, 'Test selection bag'),
  ('7f000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000002', 150, 'Storage snapshot bag'),
  ('7f000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000003', 100, 'Merge ancestry bag'),
  ('7f000000-0000-0000-0000-000000000004', '7e000000-0000-0000-0000-000000000004', 90, 'Onward chain bag'),
  ('7f000000-0000-0000-0000-000000000005', '7e000000-0000-0000-0000-000000000005', 70, 'Cleaning chain bag'),
  ('7f000000-0000-0000-0000-000000000006', '7e000000-0000-0000-0000-000000000006', 20, 'Mix probe one'),
  ('7f000000-0000-0000-0000-000000000007', '7e000000-0000-0000-0000-000000000007', 20, 'Mix probe two'),
  ('7f000000-0000-0000-0000-000000000008', '7e000000-0000-0000-0000-000000000008', 10, 'B own bag for mix'),
  ('7f000000-0000-0000-0000-000000000009', '7e000000-0000-0000-0000-000000000009', 5, 'B own bag for cleaning');

insert into public.batch_storage (id, batch_id, sub_batch_id, location_id, stored_at)
values
  ('77000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000002', '7f000000-0000-0000-0000-000000000002', '79000000-0000-0000-0000-000000000001', now() - interval '10 days'),
  ('77000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000003', '7f000000-0000-0000-0000-000000000003', '79000000-0000-0000-0000-000000000001', now() - interval '20 days'),
  ('77000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000004', '7f000000-0000-0000-0000-000000000004', '79000000-0000-0000-0000-000000000002', now() - interval '10 days');

-- Tests on the selection batch: two x-rays (and a newer soft-deleted one), two
-- cut tests with the same timestamp, one each of tz and germination, and two
-- non-quality tests. Quality statistics are computed by the table trigger.
insert into public.tests (id, batch_id, sub_batch_id, type, result, statistics, tested_at, performed_by_organisation_id, deleted_at)
values
  ('75000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
   '{"test_type":"x-ray","psu_grams":5,"repeats":[{"weight_grams":2,"viable_seed_count":4,"dead_seed_count":6}]}'::jsonb,
   null::jsonb, '2026-01-01 00:00:00+00', '7b000000-0000-0000-0000-000000000001', null),
  ('75000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
   '{"test_type":"x-ray","psu_grams":12.5,"inert_seed_weight_grams":3,"other_species_seeds_grams":1,"relative_humidity_percent":45,"notes":"SECRET NOTE","secret_field":{"a":1},"repeats":[{"weight_grams":2,"viable_seed_count":8,"dead_seed_count":2,"extra":"x","notes":"repeat note"},{"weight_grams":2,"viable_seed_count":9,"dead_seed_count":1}]}'::jsonb,
   null::jsonb, '2026-02-01 00:00:00+00', '7b000000-0000-0000-0000-000000000001', null),
  ('75000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
   '{"test_type":"x-ray","psu_grams":99,"repeats":[{"weight_grams":2,"viable_seed_count":1,"dead_seed_count":9}]}'::jsonb,
   null::jsonb, '2026-03-01 00:00:00+00', '7b000000-0000-0000-0000-000000000001', '2026-03-02 00:00:00+00'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
   '{"test_type":"cut test","psu_grams":1.1,"repeats":[{"weight_grams":1,"viable_seed_count":5,"dead_seed_count":5}]}'::jsonb,
   null::jsonb, '2026-02-01 12:00:00+00', '7b000000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
   '{"test_type":"cut test","psu_grams":2.2,"repeats":[{"weight_grams":1,"viable_seed_count":6,"dead_seed_count":4}]}'::jsonb,
   null::jsonb, '2026-02-01 12:00:00+00', '7b000000-0000-0000-0000-000000000001', null),
  ('75000000-0000-0000-0000-000000000004', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
   '{"test_type":"tz","psu_grams":7,"repeats":[{"weight_grams":1,"viable_seed_count":7,"dead_seed_count":3}]}'::jsonb,
   null::jsonb, '2026-02-02 00:00:00+00', '7b000000-0000-0000-0000-000000000001', null),
  ('75000000-0000-0000-0000-000000000005', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
   '{"test_type":"germination","psu_grams":8,"repeats":[{"weight_grams":1,"viable_seed_count":8,"dead_seed_count":2}]}'::jsonb,
   null::jsonb, '2026-02-03 00:00:00+00', '7b000000-0000-0000-0000-000000000001', null),
  ('75000000-0000-0000-0000-000000000006', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'moisture',
   '{"mc":5,"notes":"old"}'::jsonb, '{"pls":0.4,"psuCount":10,"junk":1}'::jsonb,
   '2026-01-05 00:00:00+00', '7b000000-0000-0000-0000-000000000001', null),
  ('75000000-0000-0000-0000-000000000007', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'moisture',
   '{"mc":6,"notes":"new"}'::jsonb, '{"pls":0.5,"psuCount":12,"junk":2}'::jsonb,
   '2026-01-06 00:00:00+00', '7b000000-0000-0000-0000-000000000001', null);

-- Tests on the onward and cleaning chain batches.
insert into public.tests (id, batch_id, sub_batch_id, type, result, tested_at, performed_by_organisation_id)
values
  ('75000000-0000-0000-0000-000000000008', '7e000000-0000-0000-0000-000000000004', '7f000000-0000-0000-0000-000000000004', 'quality',
   '{"test_type":"x-ray","psu_grams":10,"repeats":[{"weight_grams":1,"viable_seed_count":5,"dead_seed_count":5}]}'::jsonb,
   '2026-01-10 00:00:00+00', '7b000000-0000-0000-0000-000000000001'),
  ('75000000-0000-0000-0000-000000000009', '7e000000-0000-0000-0000-000000000004', '7f000000-0000-0000-0000-000000000004', 'quality',
   '{"test_type":"tz","psu_grams":7,"repeats":[{"weight_grams":1,"viable_seed_count":7,"dead_seed_count":3}]}'::jsonb,
   '2026-01-11 00:00:00+00', '7b000000-0000-0000-0000-000000000001'),
  ('75000000-0000-0000-0000-000000000010', '7e000000-0000-0000-0000-000000000005', '7f000000-0000-0000-0000-000000000005', 'quality',
   '{"test_type":"x-ray","psu_grams":11,"repeats":[{"weight_grams":1,"viable_seed_count":9,"dead_seed_count":1}]}'::jsonb,
   '2026-01-20 00:00:00+00', '7b000000-0000-0000-0000-000000000001');

-- Accepted transfer links, as a first accepted request leaves them.
insert into public.organisation_link (requesting_org_id, provider_org_id, created_by, kind)
values
  ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000001', 'transfer'),
  ('7b000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000002', 'transfer');

create temporary table xfer (key text primary key, result jsonb);
create temporary table lr (key text primary key, id uuid);
create temporary table fx (key text primary key, id uuid);
grant all on xfer, lr, fx to authenticated;

-- ===========================================================================
-- 1. Test selection and projection
-- ===========================================================================

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select ok(
  (select jsonb_exists(statistics, 'plsCount') and jsonb_exists(statistics, 'psuCount') from public.tests where id = '75000000-0000-0000-0000-000000000002'),
  'the source test carries seed-count estimates in its statistics'
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TT', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object('sub_batch_id', '7f000000-0000-0000-0000-000000000001')), null, '76000000-0000-0000-0000-000000000001'
    )
  $$,
  'A sends the tested bag to B'
);

insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_TT', oti.received_batch_id), ('RG_TT', oti.received_sub_batch_id), ('STI_TT', oti.seed_transfer_item_id), ('IT_TT', oti.id), ('SRC_TT', oti.sub_batch_id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TT');

select is(
  (select count(*) from public.ownership_transfer_test_snapshot where ownership_transfer_item_id = (select id from fx where key = 'IT_TT')),
  5::bigint,
  'one test per type or quality subtype was captured, with the soft-deleted test skipped'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

create temporary table prov1 as
select public.fn_received_batch_provenance((select id from fx where key = 'RB_TT')) as p;

select results_eq(
  $$
    select
      p ->> 'species_name',
      p ->> 'source_collection_code',
      (p ->> 'source_collection_year')::integer,
      jsonb_array_length(p -> 'chain'),
      jsonb_array_length(p -> 'tests')
    from prov1
  $$,
  $$ values ('Xfer Acacia testus'::text, 'PROV-CA1'::text, 2024, 1, 5) $$,
  'provenance gives species, collection code, year, one hop and five tests'
);

select results_eq(
  $$
    select p ->> 'source_ibra_code', p ->> 'source_ibra_name'
    from prov1
  $$,
  $$
    select
      public.get_ibra_code_from_location(c.location),
      (select r.name from public.ibra_regions r where r.code = public.get_ibra_code_from_location(c.location) order by r.id limit 1)
    from public.collection c where c.id = '7d000000-0000-0000-0000-000000000001'
  $$,
  'provenance resolves the IBRA region name from its code'
);

select is(
  (select p -> 'chain' -> 0 ->> 'sender_org_name' from prov1),
  'Xfer A prov',
  'the chain names the sending organisation'
);

select results_eq(
  $$
    select
      t ->> 'type',
      t ->> 'quality_test_type'
    from prov1, jsonb_array_elements(p -> 'tests') with ordinality as e(t, ord)
    order by ord
  $$,
  $$
    values
      ('moisture'::text, null::text),
      ('quality'::text, 'cut test'::text),
      ('quality'::text, 'germination'::text),
      ('quality'::text, 'tz'::text),
      ('quality'::text, 'x-ray'::text)
  $$,
  'each type and each quality subtype appears once'
);

select results_eq(
  $$
    select
      (p -> 'tests' -> 4 -> 'result' ->> 'psu_grams')::numeric,
      (p -> 'tests' -> 4 ->> 'tested_at')::timestamptz,
      p -> 'tests' -> 4 ->> 'performed_by_org_name'
    from prov1
  $$,
  $$ values (12.5::numeric, '2026-02-01 00:00:00+00'::timestamptz, 'Xfer A prov'::text) $$,
  'the newest live x-ray wins, with its date and performing organisation'
);

select is(
  (select (p -> 'tests' -> 1 -> 'result' ->> 'psu_grams')::numeric from prov1),
  2.2::numeric,
  'equal timestamps resolve to the higher test id'
);

select is(
  (
    select source_test_id
    from public.ownership_transfer_test_snapshot
    where ownership_transfer_item_id = (select id from fx where key = 'IT_TT') and quality_test_type = 'cut test'
  ),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'the cut test winner is the higher id'
);

select results_eq(
  $$
    select
      (p -> 'tests' -> 3 -> 'result' ->> 'psu_grams')::numeric,
      (p -> 'tests' -> 2 -> 'result' ->> 'psu_grams')::numeric
    from prov1
  $$,
  $$ values (7::numeric, 8::numeric) $$,
  'tz and germination each have their own latest row'
);

select ok(
  (
    select
      not jsonb_exists(p -> 'tests' -> 4 -> 'result', 'notes')
      and not jsonb_exists(p -> 'tests' -> 4 -> 'result', 'secret_field')
    from prov1
  ),
  'a projected result drops free-text notes and unknown fields'
);

select is(
  (
    select array_agg(k order by k)
    from prov1, jsonb_object_keys(p -> 'tests' -> 4 -> 'result') k
  ),
  array['inert_seed_weight_grams', 'other_species_seeds_grams', 'psu_grams', 'relative_humidity_percent', 'repeats', 'test_type'],
  'a projected quality result has only the named fields'
);

select results_eq(
  $$
    select
      jsonb_array_length(p -> 'tests' -> 4 -> 'result' -> 'repeats'),
      (
        select array_agg(k order by k)
        from jsonb_object_keys(p -> 'tests' -> 4 -> 'result' -> 'repeats' -> 0) k
      )
    from prov1
  $$,
  $$ values (2, array['dead_seed_count', 'viable_seed_count', 'weight_grams']) $$,
  'each repeat keeps only its weight and seed counts'
);

select ok(
  (
    select
      jsonb_exists(p -> 'tests' -> 4 -> 'statistics', 'pls')
      and not jsonb_exists(p -> 'tests' -> 4 -> 'statistics', 'plsCount')
      and not jsonb_exists(p -> 'tests' -> 4 -> 'statistics', 'psuCount')
    from prov1
  ),
  'projected statistics leave out the source batch''s seed-count estimates'
);

select results_eq(
  $$
    select
      jsonb_typeof(p -> 'tests' -> 0 -> 'result'),
      p -> 'tests' -> 0 -> 'statistics'
    from prov1
  $$,
  $$ values ('null'::text, '{"pls": 0.5}'::jsonb) $$,
  'a non-quality test shows no result and only its named statistics'
);

-- Later edits, deletions and new tests on the sender's batch change nothing.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

update public.tests set result = jsonb_set(result, '{psu_grams}', '99') where id = '75000000-0000-0000-0000-000000000002';
update public.tests set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000002';
insert into public.tests (id, batch_id, sub_batch_id, type, result, tested_at, performed_by_organisation_id)
values (
  '75000000-0000-0000-0000-000000000011', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
  '{"test_type":"x-ray","psu_grams":50,"repeats":[{"weight_grams":1,"viable_seed_count":9,"dead_seed_count":1}]}'::jsonb,
  '2026-04-01 00:00:00+00', '7b000000-0000-0000-0000-000000000001'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select public.fn_received_batch_provenance((select id from fx where key = 'RB_TT'))),
  (select p from prov1),
  'edits, deletions and new tests after completion leave the recipient''s view unchanged'
);

select is(
  (select count(*) from public.ownership_transfer_test_snapshot where ownership_transfer_item_id = (select id from fx where key = 'IT_TT')),
  5::bigint,
  'the captured rows are intact'
);

-- ===========================================================================
-- 2. Storage snapshots
-- ===========================================================================

-- A portion of a stored bag goes to R, who has no link yet. The original is
-- then moved before R accepts.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'S1', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000004', jsonb_build_array(jsonb_build_object('sub_batch_id', '7f000000-0000-0000-0000-000000000002', 'sample_weight_grams', 50)), null, '76000000-0000-0000-0000-000000000002'
    )
  $$,
  'A sends a 50 g portion of a stored bag to R'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into lr (key, id)
select 'AR', r.id
from public.organisation_link_request r
where r.requesting_org_id = '7b000000-0000-0000-0000-000000000001' and r.provider_org_id = '7b000000-0000-0000-0000-000000000004' and r.kind = 'transfer';

-- The split happened two days ago; the original moved one day ago.
alter table public.sub_batch_lineage disable trigger sub_batch_lineage_reject_rewrite;
update public.sub_batch_lineage
set created_at = now() - interval '2 days'
where operation_kind = 'split' and source_sub_batch_id = '7f000000-0000-0000-0000-000000000002';
alter table public.sub_batch_lineage enable trigger sub_batch_lineage_reject_rewrite;

update public.batch_storage set moved_out_at = now() - interval '1 day' where id = '77000000-0000-0000-0000-000000000001';

insert into public.batch_storage (batch_id, sub_batch_id, location_id, stored_at)
values ('7e000000-0000-0000-0000-000000000002', '7f000000-0000-0000-0000-000000000002', '79000000-0000-0000-0000-000000000002', now() - interval '1 day');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$ select public.fn_respond_transfer_link_request((select id from lr where key = 'AR'), true) $$,
  'R accepts the request'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_S1', oti.received_batch_id), ('IT_S1', oti.id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'S1');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$ select hop, started_at, ended_at, duration from public.fn_received_batch_storage_history((select id from fx where key = 'RB_S1')) $$,
  $$ values (0, now() - interval '10 days', now() - interval '2 days', interval '8 days') $$,
  'the ancestor''s storage period ends at the split, and a later period is left out'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$ select public.fn_set_sub_batch_storage('7f000000-0000-0000-0000-000000000002', '79000000-0000-0000-0000-000000000003', now()) $$,
  'A moves the original bag again after the transfer'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$ select hop, started_at, ended_at, duration from public.fn_received_batch_storage_history((select id from fx where key = 'RB_S1')) $$,
  $$ values (0, now() - interval '10 days', now() - interval '2 days', interval '8 days') $$,
  'the recipient''s storage history is unchanged by the later move'
);

select is(
  (
    select count(*)
    from public.ownership_transfer_storage_snapshot
    where ownership_transfer_item_id = (select id from fx where key = 'IT_S1')
  ),
  1::bigint,
  'one period was captured'
);

-- A split and merge diamond reaches one ancestor by two paths.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

create temporary table sa2_kids as
select unnest(public.fn_split_sub_batch('7f000000-0000-0000-0000-000000000003', '[{"weight_grams":30},{"weight_grams":30}]'::jsonb)) as id;

create temporary table sa2_merged as
select public.fn_merge_sub_batches((select array_agg(id order by id) from sa2_kids), null, null) as id;

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'S2', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object('sub_batch_id', (select id from sa2_merged))), null, '76000000-0000-0000-0000-000000000003'
    )
  $$,
  'A sends the merged bag to B'
);

insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_S2', oti.received_batch_id), ('RG_S2', oti.received_sub_batch_id), ('STI_S2', oti.seed_transfer_item_id), ('IT_S2', oti.id), ('SRC_S2', oti.sub_batch_id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'S2');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$ select hop, started_at, ended_at, duration from public.fn_received_batch_storage_history((select id from fx where key = 'RB_S2')) $$,
  $$ values (0, now() - interval '20 days', now(), interval '20 days') $$,
  'an ancestor reached by two lineage paths yields one storage period'
);

-- ===========================================================================
-- 3. Onward transfer A to B to C
-- ===========================================================================

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'OB', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object('sub_batch_id', '7f000000-0000-0000-0000-000000000004')), null, '76000000-0000-0000-0000-000000000004'
    )
  $$,
  'A sends the onward-chain bag to B'
);

insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_OB', oti.received_batch_id), ('RG_OB', oti.received_sub_batch_id), ('STI_OB', oti.seed_transfer_item_id), ('IT_OB', oti.id), ('SRC_OB', oti.sub_batch_id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'OB');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_create_quality_test(
      (select id from fx where key = 'RB_OB'), (select id from fx where key = 'RG_OB'),
      '{"test_type":"x-ray","psu_grams":20,"repeats":[{"weight_grams":1,"viable_seed_count":9,"dead_seed_count":1}]}'::jsonb,
      '7b000000-0000-0000-0000-000000000002'
    )
  $$,
  'B records its own x-ray on the received bag'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into public.batch_storage (batch_id, sub_batch_id, location_id, stored_at)
values ((select id from fx where key = 'RB_OB'), (select id from fx where key = 'RG_OB'), '79000000-0000-0000-0000-000000000004', now() - interval '5 days');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    select
      jsonb_array_length(p -> 'tests'),
      (select count(*) from jsonb_array_elements(p -> 'tests') t where t ->> 'performed_by_org_name' = 'Xfer A prov')
    from (select public.fn_received_batch_provenance((select id from fx where key = 'RB_OB')) as p) q
  $$,
  $$ values (2, 2::bigint) $$,
  'B first sees A''s two results'
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'BC', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', jsonb_build_array(jsonb_build_object('sub_batch_id', (select id from fx where key = 'RG_OB'))), null, '76000000-0000-0000-0000-000000000005'
    )
  $$,
  'B sends the received bag on to C'
);

insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_BC', oti.received_batch_id), ('RG_BC', oti.received_sub_batch_id), ('STI_BC', oti.seed_transfer_item_id), ('IT_BC', oti.id), ('SRC_BC', oti.sub_batch_id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'BC');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000003","role":"Admin","permissions":[]}}',
  true
);

create temporary table prov2 as
select public.fn_received_batch_provenance((select id from fx where key = 'RB_BC')) as p;

select results_eq(
  $$
    select
      p ->> 'species_name',
      p ->> 'source_collection_code',
      (p ->> 'source_collection_year')::integer,
      jsonb_array_length(p -> 'chain')
    from prov2
  $$,
  $$ values ('Xfer Acacia testus'::text, 'PROV-CA1'::text, 2024, 2) $$,
  'the original collection code and year survive the second hop'
);

select results_eq(
  $$
    select t ->> 'sender_org_name', (t ->> 'hop')::integer
    from prov2, jsonb_array_elements(p -> 'chain') with ordinality as e(t, ord)
    order by ord
  $$,
  $$ values ('Xfer B prov'::text, 0), ('Xfer A prov'::text, 1) $$,
  'the chain lists B then A'
);

select results_eq(
  $$
    select
      t ->> 'quality_test_type',
      t ->> 'performed_by_org_name',
      (t ->> 'hop')::integer,
      (t -> 'result' ->> 'psu_grams')::numeric
    from prov2, jsonb_array_elements(p -> 'tests') with ordinality as e(t, ord)
    order by ord
  $$,
  $$
    values
      ('tz'::text, 'Xfer A prov'::text, 1, 7::numeric),
      ('x-ray'::text, 'Xfer B prov'::text, 0, 20::numeric)
  $$,
  'C gets the latest x-ray (B''s) and the subtype only A tested, each credited and dated'
);

select results_eq(
  $$ select hop, started_at, ended_at, duration from public.fn_received_batch_storage_history((select id from fx where key = 'RB_BC')) $$,
  $$
    values
      (0, now() - interval '5 days', now(), interval '5 days'),
      (1, now() - interval '10 days', now(), interval '10 days')
  $$,
  'an earlier receipt''s captured storage periods are carried forward'
);

select is(
  (select count(*) from public.species where organisation_id = '7b000000-0000-0000-0000-000000000003'),
  1::bigint,
  'the recipient''s species row is created once and then matched by guid'
);

-- ===========================================================================
-- 4. Cleaning a received batch, then transferring the output
-- ===========================================================================

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'CB', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object('sub_batch_id', '7f000000-0000-0000-0000-000000000005')), null, '76000000-0000-0000-0000-000000000006'
    )
  $$,
  'A sends the cleaning-chain bag to B'
);

insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_CB', oti.received_batch_id), ('RG_CB', oti.received_sub_batch_id), ('STI_CB', oti.seed_transfer_item_id), ('IT_CB', oti.id), ('SRC_CB', oti.sub_batch_id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'CB');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

create temporary table cl as
select public.fn_clean_sub_batch(
  (select id from fx where key = 'RG_CB'), interval '1 hour', 'seed', null, null, true, null, '{}'::uuid[],
  '[{"quality":"HQ","material_type":"seed","weight_grams":30},{"quality":"HQ","material_type":"seed","weight_grams":20}]'::jsonb
) as id;

select is((select count(*) from cl), 1::bigint, 'B cleaned the received bag through fn_clean_sub_batch');

select results_eq(
  $$
    select b.code, b.weight_grams
    from public.batches b
    inner join public.batch_cleaning_output o on o.output_batch_id = b.id
    where o.cleaning_id = (select id from cl)
    order by b.code
  $$,
  $$ values ('PROV-CA1-HQ-1'::text, 30::numeric), ('PROV-CA1-HQ-2'::text, 20::numeric) $$,
  'cleaned outputs are numbered from the source collection code'
);

select is(
  (
    select count(*)
    from public.batches b
    inner join public.batch_cleaning_output o on o.output_batch_id = b.id
    where o.cleaning_id = (select id from cl)
      and b.organisation_id = '7b000000-0000-0000-0000-000000000002'
      and b.collection_id is null
      and b.species_id = (select species_id from public.batches where id = (select id from fx where key = 'RB_CB'))
      and b.source_collection_code = 'PROV-CA1'
      and b.source_ibra_code is not distinct from (select source_ibra_code from public.batches where id = (select id from fx where key = 'RB_CB'))
      and b.source_collection_year = 2024
  ),
  2::bigint,
  'outputs carry the recipient''s species and the source code, IBRA code and year'
);

select is(
  (
    select count(*)
    from public.batches b
    inner join public.batch_cleaning_output o on o.output_batch_id = b.id
    where o.cleaning_id = (select id from cl) and b.received_transfer_item_id is not null
  ),
  0::bigint,
  'outputs do not carry the receipt''s transfer pointer'
);

select is(
  (
    select count(*)
    from public.sub_batch_lineage l
    where l.operation_kind = 'cleaning' and l.source_sub_batch_id = (select id from fx where key = 'RG_CB') and l.operation_id = (select id from cl)
  ),
  2::bigint,
  'each output has an ordinary cleaning lineage edge'
);

select is(
  (select current_weight from public.sub_batch_current_weight where id = (select id from fx where key = 'RG_CB')),
  0::numeric,
  'the cleaned input bag was fully consumed'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into fx (key, id)
select 'OUT1_BATCH', b.id
from public.batches b inner join public.batch_cleaning_output o on o.output_batch_id = b.id
where o.cleaning_id = (select id from cl) and b.code = 'PROV-CA1-HQ-1';

insert into fx (key, id)
select 'OUT1_BAG', sb.id from public.sub_batches sb where sb.batch_id = (select id from fx where key = 'OUT1_BATCH');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_create_quality_test(
      (select id from fx where key = 'OUT1_BATCH'), (select id from fx where key = 'OUT1_BAG'),
      '{"test_type":"x-ray","psu_grams":33,"repeats":[{"weight_grams":1,"viable_seed_count":9,"dead_seed_count":1}]}'::jsonb,
      '7b000000-0000-0000-0000-000000000002'
    )
  $$,
  'B tests the cleaned output'
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'CC', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', jsonb_build_array(jsonb_build_object('sub_batch_id', (select id from fx where key = 'OUT1_BAG'))), null, '76000000-0000-0000-0000-000000000007'
    )
  $$,
  'B sends the cleaned output to C'
);

insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_CC', oti.received_batch_id), ('RG_CC', oti.received_sub_batch_id), ('STI_CC', oti.seed_transfer_item_id), ('IT_CC', oti.id), ('SRC_CC', oti.sub_batch_id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'CC');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000003","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    select
      p ->> 'source_collection_code',
      (p ->> 'source_collection_year')::integer,
      jsonb_array_length(p -> 'chain'),
      jsonb_array_length(p -> 'tests'),
      p -> 'tests' -> 0 ->> 'performed_by_org_name',
      (p -> 'tests' -> 0 -> 'result' ->> 'psu_grams')::numeric
    from (select public.fn_received_batch_provenance((select id from fx where key = 'RB_CC')) as p) q
  $$,
  $$ values ('PROV-CA1'::text, 2024, 1, 1, 'Xfer B prov'::text, 33::numeric) $$,
  'C gets the original code and only the post-cleaning test'
);

select is(
  (select count(*) from public.species where organisation_id = '7b000000-0000-0000-0000-000000000003'),
  1::bigint,
  'the cleaned output''s species matched the existing guid row'
);

select results_eq(
  $$ select count(*)::integer, min(sender_org_name) from public.fn_received_batch_sources() $$,
  $$ values (2, 'Xfer B prov'::text) $$,
  'the received-from list names the sender of each of C''s receipts'
);

-- Cleaning a collection-backed bag still works, and reads its collection.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_clean_sub_batch(
      '7f000000-0000-0000-0000-000000000009', interval '10 minutes', 'seed', null, null, true, null, '{}'::uuid[],
      '[{"quality":"HQ","material_type":"seed","weight_grams":4}]'::jsonb
    )
  $$,
  'a collection-backed bag can still be cleaned'
);

select results_eq(
  $$
    select b.code, b.collection_id, b.source_collection_code
    from public.batches b
    inner join public.batch_cleaning_output o on o.output_batch_id = b.id
    inner join public.batch_cleaning c on c.id = o.cleaning_id
    where c.input_sub_batch_id = '7f000000-0000-0000-0000-000000000009'
  $$,
  $$ values ('PROV-CB1-HQ-1'::text, '7d000000-0000-0000-0000-000000000002'::uuid, null::text) $$,
  'its output keeps the collection and gets no source code'
);

-- ===========================================================================
-- 5. Read authorisation and forged provenance
-- ===========================================================================

reset role;
select set_config('request.jwt.claims', '', true);

insert into fx (key, id) values ('STI_ANY', (select seed_transfer_item_id from public.ownership_transfer_item where id = (select id from fx where key = 'IT_TT')));

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_received_batch_provenance((select id from fx where key = 'RB_TT')) $$,
  'P0002',
  null,
  'another organisation cannot read a received batch''s provenance'
);

select throws_ok(
  $$ select * from public.fn_received_batch_storage_history((select id from fx where key = 'RB_TT')) $$,
  'P0002',
  null,
  'another organisation cannot read a received batch''s storage history'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_received_batch_provenance((select id from fx where key = 'RB_TT')) $$,
  'P0002',
  null,
  'the sender cannot read the received batch''s provenance'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_received_batch_provenance('7e000000-0000-0000-0000-000000000001') $$,
  'P0002',
  null,
  'a batch that is not a receipt has no provenance'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ update public.batches set received_transfer_item_id = (select id from fx where key = 'STI_ANY') where id = (select id from fx where key = 'RB_S2') $$,
  '55000',
  null,
  'the transfer pointer of a batch cannot be changed'
);

select throws_ok(
  $$ update public.batches set source_collection_code = 'FORGED' where id = (select id from fx where key = 'RB_S2') $$,
  '55000',
  null,
  'the source collection code of a batch cannot be changed'
);

select throws_ok(
  $$ update public.batches set source_ibra_code = 'XXX', source_collection_year = 1999 where id = (select id from fx where key = 'RB_S2') $$,
  '55000',
  null,
  'the source IBRA code and year of a batch cannot be changed'
);

select throws_ok(
  $$
    insert into public.batches (organisation_id, code, source_collection_code)
    values ('7b000000-0000-0000-0000-000000000002', 'FORGE-1', 'FORGED')
  $$,
  '42501',
  null,
  'a client cannot insert a batch with a source collection code'
);

select throws_ok(
  $$
    insert into public.batches (organisation_id, code, received_transfer_item_id)
    values ('7b000000-0000-0000-0000-000000000002', 'FORGE-2', (select id from fx where key = 'STI_ANY'))
  $$,
  '42501',
  null,
  'a client cannot insert a batch that points at a transfer item'
);

select throws_ok(
  $$
    insert into public.batches (organisation_id, code, source_collection_year)
    values ('7b000000-0000-0000-0000-000000000002', 'FORGE-3', 2001)
  $$,
  '42501',
  null,
  'a client cannot insert a batch with a source collection year'
);

-- A batch of another organisation that points at B's genuine transfer item.
-- The pointer is unique, so the genuine batch gives its pointer up first.
reset role;
select set_config('request.jwt.claims', '', true);

alter table public.batches disable trigger batches_provenance_guard;
update public.batches set received_transfer_item_id = null where id = (select id from fx where key = 'RB_S2');
insert into public.batches (id, organisation_id, code, species_id, received_transfer_item_id, source_collection_code)
values ('7e000000-0000-0000-0000-000000000010', '7b000000-0000-0000-0000-000000000004', 'FORGED-RECEIPT', null, (select seed_transfer_item_id from public.ownership_transfer_item where id = (select id from fx where key = 'IT_S2')), 'PROV-CA1');
alter table public.batches enable trigger batches_provenance_guard;

insert into public.batch_custody (batch_id, organisation_id)
values ('7e000000-0000-0000-0000-000000000010', '7b000000-0000-0000-0000-000000000004');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_received_batch_provenance('7e000000-0000-0000-0000-000000000010') $$,
  'P0002',
  null,
  'a batch pointing at another organisation''s transfer item gets no provenance'
);

select throws_ok(
  $$ select * from public.fn_received_batch_storage_history('7e000000-0000-0000-0000-000000000010') $$,
  'P0002',
  null,
  'a forged pointer gets no storage history'
);

select is(
  (select count(*) from public.fn_received_batch_sources() where batch_id = '7e000000-0000-0000-0000-000000000010'),
  0::bigint,
  'a forged pointer is not listed as received from anyone'
);

-- ===========================================================================
-- 6. Mixing, combining and merging received batches
-- ===========================================================================

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'M1', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object('sub_batch_id', '7f000000-0000-0000-0000-000000000006')), null, '76000000-0000-0000-0000-000000000008'
    )
  $$,
  'A sends the first mix probe to B'
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'M2', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object('sub_batch_id', '7f000000-0000-0000-0000-000000000007')), null, '76000000-0000-0000-0000-000000000009'
    )
  $$,
  'A sends the second mix probe to B'
);

insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_M1', oti.received_batch_id), ('RG_M1', oti.received_sub_batch_id), ('STI_M1', oti.seed_transfer_item_id), ('IT_M1', oti.id), ('SRC_M1', oti.sub_batch_id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'M1');
insert into fx (key, id)
select t.k, t.v
from public.ownership_transfer_item oti
cross join lateral (values ('RB_M2', oti.received_batch_id), ('RG_M2', oti.received_sub_batch_id), ('STI_M2', oti.seed_transfer_item_id), ('IT_M2', oti.id), ('SRC_M2', oti.sub_batch_id)) as t(k, v)
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'M2');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_combine_batches(array[(select id from fx where key = 'RB_M1'), (select id from fx where key = 'RB_M2')]::uuid[]) $$,
  'P0001',
  'Only batches that have not been cleaned can be combined',
  'received batches cannot be combined'
);

select throws_ok(
  $$ select public.fn_combine_batches(array[(select id from fx where key = 'RB_M1'), '7e000000-0000-0000-0000-000000000008']::uuid[]) $$,
  'P0001',
  'Only batches that have not been cleaned can be combined',
  'a received batch cannot be combined with an own batch either'
);

select throws_ok(
  $$ select public.fn_mix_batches(array[(select id from fx where key = 'RB_M1'), (select id from fx where key = 'RB_M2')]::uuid[]) $$,
  'P0001',
  'Only batches derived from a collection can be mixed',
  'received batches cannot be mixed'
);

select throws_ok(
  $$ select public.fn_merge_batches(array[(select id from fx where key = 'RB_M1'), (select id from fx where key = 'RB_M2')]::uuid[]) $$,
  'P0001',
  'All batches must be derived from the same collection',
  'received batches cannot be merged'
);

select is(
  (select count(*) from public.batch_merges where source_batch_id in ((select id from fx where key = 'RB_M1'), (select id from fx where key = 'RB_M2'), '7e000000-0000-0000-0000-000000000008')),
  0::bigint,
  'the rejected calls consumed nothing'
);

-- A received batch next to a collection-backed one. The species and IBRA
-- counts inner-join collection and would drop the received batch, so
-- fn_mix_batches rejects collectionless sources up front. Kept last because
-- it changes state if the guard regresses.
select throws_ok(
  $$ select public.fn_mix_batches(array[(select id from fx where key = 'RB_M1'), '7e000000-0000-0000-0000-000000000008']::uuid[]) $$,
  'P0001',
  null,
  'a received batch cannot be mixed with a collection-backed batch'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
