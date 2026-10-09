begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- A Testing organisation lists, and can correct, the tests it performed. Once
-- the lab has returned the bag it holds nothing of the batch and can no longer
-- read it: the history must still say which batch and owner a test was for.

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'test-history-owner@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'test-history-lab@test.invalid');

insert into public.organisation (id, name, owner_id, is_testing_provider)
values
  ('f1000000-0000-0000-0000-000000000001', 'History owner', 'f0000000-0000-0000-0000-000000000001', false),
  ('f1000000-0000-0000-0000-000000000002', 'History lab', 'f0000000-0000-0000-0000-000000000002', true);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Admin', true, '{}');

insert into public.organisation_link (requesting_org_id, provider_org_id, created_by)
values (
  'f1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000001'
);

insert into public.batches (id, organisation_id, code)
values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'HIST-1');

insert into public.batch_custody (batch_id, organisation_id)
values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001');

insert into public.sub_batches (id, batch_id, weight_grams, notes)
values ('f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 10, 'Bag tested then returned');

set local role authenticated;

-- The owner sends the bag.
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"f1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select * from public.fn_assign_bags_for_testing(
      'f1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"f3000000-0000-0000-0000-000000000001"}]'::jsonb
    )
  $$,
  'the owner assigns the bag to the lab'
);

-- The lab tests part of it, then hands the rest back.
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"f1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_create_quality_test(
      'f2000000-0000-0000-0000-000000000001',
      'f3000000-0000-0000-0000-000000000001',
      '{"repeats":[{"weight_grams":5}]}'::jsonb,
      'f1000000-0000-0000-0000-000000000002'
    )
  $$,
  'the lab tests the bag'
);

select results_eq(
  $$
    select sub_batch_id, test_id
    from public.fn_testing_held_bag_tests()
  $$,
  $$
    select sub_batch_id, id
    from public.tests
    where batch_id = 'f2000000-0000-0000-0000-000000000001'
  $$,
  'a held bag is paired with the test recorded against it'
);

select lives_ok(
  $$ select * from public.fn_return_held_bag_from_testing('f3000000-0000-0000-0000-000000000001') $$,
  'the lab returns the bag to its owner'
);

select is(
  (select count(*) from public.fn_testing_held_bags()),
  0::bigint,
  'the lab no longer holds the bag'
);

select is(
  (select count(*) from public.fn_testing_held_bag_tests()),
  0::bigint,
  'a returned bag is no longer paired with tests'
);

select is(
  (select count(*) from public.batches where id = 'f2000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the lab can no longer read the batch'
);

select results_eq(
  $$
    select batch_code, owner_org_name
    from public.fn_testing_test_history()
  $$,
  $$ values ('HIST-1'::text, 'History owner'::text) $$,
  'the lab''s history still names the batch and owner of the test'
);

-- The lab corrects the result.
select lives_ok(
  $$
    update public.tests
    set result = '{"repeats":[{"weight_grams":5}],"notes":"Rechecked"}'::jsonb
    where batch_id = 'f2000000-0000-0000-0000-000000000001'
  $$,
  'the lab can edit a test it performed'
);

select is(
  (select result ->> 'notes' from public.fn_testing_test_history()),
  'Rechecked',
  'the history shows the corrected result'
);

-- The owner's own history does not include the lab's tests.
select set_config(
  'request.jwt.claims',
  '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"f1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select count(*) from public.fn_testing_test_history()),
  0::bigint,
  'another organisation''s history does not include the lab''s tests'
);

select * from finish();

rollback;
