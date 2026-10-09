begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- A Testing organisation splits and merges bags it was sent. The assignment
-- follows the seed through lineage: it stays open while the lab holds any of
-- it, and closes once the lab holds none.

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lab-split-general-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'lab-split-testing-admin@test.invalid');

insert into public.organisation (id, name, owner_id, is_testing_provider)
values
  ('e1000000-0000-0000-0000-000000000001', 'Lab split owner', 'e0000000-0000-0000-0000-000000000001', false),
  ('e1000000-0000-0000-0000-000000000002', 'Lab split provider', 'e0000000-0000-0000-0000-000000000002', true);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('e1000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'Admin', true, '{}');

insert into public.organisation_link (requesting_org_id, provider_org_id, created_by)
values (
  'e1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000001'
);

insert into public.batches (id, organisation_id, code)
values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'LAB-SPLIT-1'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'LAB-SPLIT-2');

insert into public.batch_custody (batch_id, organisation_id)
values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001');

insert into public.containers (id, organisation_id, name, purpose, active)
values
  ('e5000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Owner mailing box', 'storage', true),
  ('e5000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'Lab vial', 'storage', true);

insert into public.storage_locations (id, organisation_id, name, active)
values ('e4000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'Lab shelf', true);

insert into public.sub_batches (id, batch_id, container_id, weight_grams, notes)
values
  ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 100, 'First sent bag'),
  ('e3000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 50, 'Second sent bag'),
  ('e3000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001', 30, 'Bag tested to nothing');

create temporary table split_result (id uuid);
create temporary table merge_result (id uuid);
grant insert, select on split_result, merge_result to authenticated;

set local role authenticated;

-- The owner sends three bags.
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"e1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select * from public.fn_assign_bags_for_testing(
      'e1000000-0000-0000-0000-000000000002',
      '[
        {"sub_batch_id":"e3000000-0000-0000-0000-000000000001"},
        {"sub_batch_id":"e3000000-0000-0000-0000-000000000002"},
        {"sub_batch_id":"e3000000-0000-0000-0000-000000000003"}
      ]'::jsonb
    )
  $$,
  'the owner assigns three bags to the lab'
);

-- Everything from here on is the lab.
select set_config(
  'request.jwt.claims',
  '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"e1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

reset role;

select is(
  (select count(*) from public.fn_testing_held_bags()),
  3::bigint,
  'the lab inventory lists each bag it was sent'
);

-- Split ---------------------------------------------------------------------

set local role authenticated;

select lives_ok(
  $$
    insert into split_result (id)
    select unnest(public.fn_split_sub_batch(
      'e3000000-0000-0000-0000-000000000001',
      '[{"weight_grams":20,"container_id":"e5000000-0000-0000-0000-000000000002","location_id":"e4000000-0000-0000-0000-000000000001"}]'::jsonb
    ))
  $$,
  'the lab splits a bag it was sent'
);

reset role;

select results_eq(
  $$
    select held.assignment_id
    from public.fn_testing_held_bags() held
    where held.sub_batch_id = (select id from split_result)
  $$,
  $$
    select id
    from public.batch_testing_assignment
    where sub_batch_id = 'e3000000-0000-0000-0000-000000000001'
  $$,
  'the split child is listed against its parent''s assignment'
);

-- Merge ---------------------------------------------------------------------

set local role authenticated;

select lives_ok(
  $$
    insert into merge_result (id)
    select public.fn_merge_sub_batches(
      array[
        'e3000000-0000-0000-0000-000000000002',
        (select id from split_result)
      ]::uuid[],
      'e5000000-0000-0000-0000-000000000002',
      'e4000000-0000-0000-0000-000000000001',
      'Lab merge'
    )
  $$,
  'the lab merges two bags of one batch it holds'
);

reset role;

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = (select id from merge_result)
  ),
  'e1000000-0000-0000-0000-000000000002'::uuid,
  'the merged bag is held by the lab'
);

select results_eq(
  $$
    select held.assignment_id
    from public.fn_testing_held_bags() held
    where held.sub_batch_id = (select id from merge_result)
    order by held.assignment_id
  $$,
  $$
    select id
    from public.batch_testing_assignment
    where sub_batch_id in (
      'e3000000-0000-0000-0000-000000000001',
      'e3000000-0000-0000-0000-000000000002'
    )
    order by id
  $$,
  'the merged bag is listed against both source assignments'
);

select is(
  (select count(*) from public.fn_testing_held_bags() held
   where held.sub_batch_id in (
     'e3000000-0000-0000-0000-000000000002',
     (select id from split_result)
   )),
  0::bigint,
  'emptied merge sources leave the lab inventory'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where sub_batch_id in (
      'e3000000-0000-0000-0000-000000000001',
      'e3000000-0000-0000-0000-000000000002'
    )
      and closed_at is null
  ),
  2::bigint,
  'merging closes no assignment while the lab holds its seed'
);

-- Test the merged bag -------------------------------------------------------

set local role authenticated;

select lives_ok(
  $$
    select public.fn_create_quality_test(
      'e2000000-0000-0000-0000-000000000001',
      (select id from merge_result),
      '{"repeats":[{"weight_grams":10}]}'::jsonb,
      'e1000000-0000-0000-0000-000000000002'
    )
  $$,
  'the lab tests the merged bag'
);

reset role;

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where sub_batch_id in (
      'e3000000-0000-0000-0000-000000000001',
      'e3000000-0000-0000-0000-000000000002'
    )
      and completed_at is not null
  ),
  2::bigint,
  'a test on the merged bag completes both assignments it carries'
);

-- Return the merged bag -----------------------------------------------------

set local role authenticated;

select lives_ok(
  $$
    select * from public.fn_return_held_bag_from_testing(
      (select id from merge_result)
    )
  $$,
  'the lab returns the merged bag'
);

reset role;

select is(
  (
    select outcome
    from public.batch_testing_assignment
    where sub_batch_id = 'e3000000-0000-0000-0000-000000000002'
  ),
  'returned'::text,
  'an assignment whose seed is all returned closes as returned'
);

select is(
  (
    select closed_at
    from public.batch_testing_assignment
    where sub_batch_id = 'e3000000-0000-0000-0000-000000000001'
  ),
  null,
  'an assignment stays open while the lab still holds some of its seed'
);

select results_eq(
  $$
    select held_by_org_id, container_id
    from public.sub_batches
    where id = (select id from merge_result)
  $$,
  $$
    values (
      'e1000000-0000-0000-0000-000000000001'::uuid,
      null::uuid
    )
  $$,
  'the returned bag goes to the owner without the lab''s container'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = (select id from merge_result)
      and moved_out_at is null
  ),
  0::bigint,
  'the returned bag is taken off the lab''s shelf'
);

-- Return the rest of the first assignment -----------------------------------

set local role authenticated;

select lives_ok(
  $$
    select * from public.fn_return_held_bag_from_testing(
      'e3000000-0000-0000-0000-000000000001'
    )
  $$,
  'the lab returns the remainder of the split bag'
);

reset role;

select is(
  (
    select outcome
    from public.batch_testing_assignment
    where sub_batch_id = 'e3000000-0000-0000-0000-000000000001'
  ),
  'returned'::text,
  'returning the last of an assignment''s seed closes it'
);

select is(
  (
    select container_id
    from public.sub_batches
    where id = 'e3000000-0000-0000-0000-000000000001'
  ),
  'e5000000-0000-0000-0000-000000000001'::uuid,
  'a bag returned in the owner''s mailing container keeps it'
);

set local role authenticated;

select throws_ok(
  $$
    select * from public.fn_return_held_bag_from_testing(
      'e3000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'a bag the lab no longer holds cannot be returned again'
);

reset role;

-- Consumption through a split child -----------------------------------------

set local role authenticated;

select lives_ok(
  $$
    select public.fn_split_sub_batch(
      'e3000000-0000-0000-0000-000000000003',
      '[{"weight_grams":30}]'::jsonb
    )
  $$,
  'the lab moves a whole bag into a split child'
);

select lives_ok(
  $$
    select public.fn_create_quality_test(
      'e2000000-0000-0000-0000-000000000002',
      (
        select lineage.derived_sub_batch_id
        from public.sub_batch_lineage lineage
        where lineage.source_sub_batch_id = 'e3000000-0000-0000-0000-000000000003'
      ),
      '{"repeats":[{"weight_grams":30}]}'::jsonb,
      'e1000000-0000-0000-0000-000000000002'
    )
  $$,
  'the lab tests the split child to nothing'
);

reset role;

select results_eq(
  $$
    select outcome, work_status
    from public.batch_testing_assignment
    where sub_batch_id = 'e3000000-0000-0000-0000-000000000003'
  $$,
  $$ values ('consumed'::text, 'completed'::text) $$,
  'consuming the last of an assignment through a child closes it as consumed'
);

select is(
  (select count(*) from public.fn_testing_held_bags()),
  0::bigint,
  'the lab inventory is empty once every assignment has closed'
);

select * from finish();

rollback;
