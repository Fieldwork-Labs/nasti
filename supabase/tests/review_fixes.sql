begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Regressions for the inventory branch review: direct bag writes are
-- authorised against the parent batch, a test's consumed weight is fixed once
-- recorded, and the assignment-based return keeps an assignment open while the
-- laboratory still holds a split child.
--
-- Not covered here: the bag lock fn_create_quality_test now takes. Two
-- concurrent tests need two sessions, which a pgTAP file does not have.

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'review-owner@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'review-lab@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'review-intruder@test.invalid');

insert into public.organisation (id, name, owner_id, is_testing_provider)
values
  ('61000000-0000-0000-0000-000000000001', 'Review owner', '60000000-0000-0000-0000-000000000001', false),
  ('61000000-0000-0000-0000-000000000002', 'Review lab', '60000000-0000-0000-0000-000000000002', true),
  ('61000000-0000-0000-0000-000000000003', 'Review intruder', '60000000-0000-0000-0000-000000000003', false);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'Admin', true, '{}'),
  ('61000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', 'Admin', true, '{}');

insert into public.organisation_link (requesting_org_id, provider_org_id, created_by)
values (
  '61000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-000000000001'
);

insert into public.batches (id, organisation_id, code)
values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'REVIEW-1'),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003', 'REVIEW-2');

insert into public.batch_custody (batch_id, organisation_id)
values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001'),
  ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003');

insert into public.containers (id, organisation_id, name, purpose, active)
values ('65000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'Review lab vial', 'storage', true);

insert into public.sub_batches (id, batch_id, weight_grams, notes)
values
  ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 100, 'Sent, split, returned'),
  ('63000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', 100, 'Tested then edited'),
  ('63000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000002', 100, 'Intruder bag');

create temporary table review_test (id uuid);
create temporary table review_split (id uuid);
grant insert, select on review_test, review_split to authenticated;

-- Direct bag writes ----------------------------------------------------------

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"61000000-0000-0000-0000-000000000003","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    insert into public.sub_batches (batch_id, held_by_org_id, weight_grams)
    values (
      '62000000-0000-0000-0000-000000000001',
      '61000000-0000-0000-0000-000000000003',
      10
    )
  $$,
  '42501',
  null,
  'a bag cannot be inserted into another organisation''s batch'
);

select lives_ok(
  $$
    insert into public.sub_batches (batch_id, weight_grams)
    values ('62000000-0000-0000-0000-000000000002', 10)
  $$,
  'a bag can still be inserted into the caller''s own batch'
);

select throws_ok(
  $$
    update public.sub_batches
    set batch_id = '62000000-0000-0000-0000-000000000001'
    where id = '63000000-0000-0000-0000-000000000003'
  $$,
  '42501',
  null,
  'a bag cannot be reparented into another organisation''s batch'
);

reset role;

select is(
  (
    select count(*)
    from public.sub_batches
    where batch_id = '62000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'the foreign batch gains no bag'
);

-- Editing a test -------------------------------------------------------------

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"61000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into review_test (id)
    select public.fn_create_quality_test(
      '62000000-0000-0000-0000-000000000001',
      '63000000-0000-0000-0000-000000000002',
      '{"test_type":"cut test","repeats":[{"weight_grams":10}]}'::jsonb,
      '61000000-0000-0000-0000-000000000001'
    )
  $$,
  'the owner records a 10g cut test'
);

select throws_ok(
  $$
    update public.tests
    set result = jsonb_set(result, '{repeats,0,weight_grams}', '20')
    where id = (select id from review_test)
  $$,
  '22023',
  null,
  'an edit cannot change a replicate weight'
);

select throws_ok(
  $$
    update public.tests
    set result = jsonb_set(result, '{test_type}', '"x-ray"')
    where id = (select id from review_test)
  $$,
  '22023',
  null,
  'an edit cannot turn a destructive test into an X-Ray'
);

select lives_ok(
  $$
    update public.tests
    set result = jsonb_set(result, '{notes}', '"Corrected"')
    where id = (select id from review_test)
  $$,
  'an edit can still change fields that consume nothing'
);

reset role;

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = '63000000-0000-0000-0000-000000000002'
  ),
  90::numeric,
  'the bag still holds what the test left'
);

-- Assignment-based return ----------------------------------------------------

set local role authenticated;

select lives_ok(
  $$
    select * from public.fn_assign_bags_for_testing(
      '61000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"63000000-0000-0000-0000-000000000001"}]'::jsonb
    )
  $$,
  'the owner sends a bag to the lab'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"61000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into review_split (id)
    select unnest(public.fn_split_sub_batch(
      '63000000-0000-0000-0000-000000000001',
      '[{"weight_grams":20,"container_id":"65000000-0000-0000-0000-000000000001"}]'::jsonb
    ))
  $$,
  'the lab splits off a 20g child'
);

select lives_ok(
  $$
    select public.fn_return_bag_from_testing(
      (select id from public.batch_testing_assignment where sub_batch_id = '63000000-0000-0000-0000-000000000001')
    )
  $$,
  'the lab returns the original bag by assignment'
);

reset role;

select is(
  (
    select closed_at
    from public.batch_testing_assignment
    where sub_batch_id = '63000000-0000-0000-0000-000000000001'
  ),
  null::timestamptz,
  'the assignment stays open while the lab holds the child'
);

select is(
  (
    select count(*)
    from public.fn_testing_held_bags() held
    where held.sub_batch_id = (select id from review_split)
  ),
  1::bigint,
  'the retained child is still listed as held testing work'
);

select * from finish();

rollback;
