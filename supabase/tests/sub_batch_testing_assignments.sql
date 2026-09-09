begin;

create extension if not exists pgtap with schema extensions;

select plan(138);

-- The fixture deliberately has several bags in one parent batch.  The
-- assignment contract is bag-grained even when the parent remains shared.

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sub-assignment-general-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sub-assignment-general-member@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sub-assignment-testing-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'sub-assignment-testing-member@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'sub-assignment-other-admin@test.invalid');

insert into public.organisation (id, name, owner_id, is_testing_provider)
values
  ('d1000000-0000-0000-0000-000000000001', 'Sub-assignment owner', 'd0000000-0000-0000-0000-000000000001', false),
  ('d1000000-0000-0000-0000-000000000002', 'Sub-assignment provider', 'd0000000-0000-0000-0000-000000000003', true),
  ('d1000000-0000-0000-0000-000000000003', 'Sub-assignment other provider', 'd0000000-0000-0000-0000-000000000005', true);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Member', true, '{inventory}'),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Admin', true, '{}'),
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004', 'Member', true, '{}'),
  ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000005', 'Admin', true, '{}');

insert into public.organisation_link (
  requesting_org_id,
  provider_org_id,
  created_by
)
values (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000001'
);

insert into public.species (id, name, organisation_id)
values (
  'd5000000-0000-0000-0000-000000000001',
  'Sub-assignment fixture species',
  'd1000000-0000-0000-0000-000000000001'
);

insert into public.collection (
  id,
  species_id,
  organisation_id,
  collected_by,
  collected_on,
  person_ids,
  code
)
select
  'd7000000-0000-0000-0000-000000000001',
  'd5000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  current_date,
  array[p.id],
  'SUBASSIGN-CO.TST.26'
from public.person p
where p.organisation_id = 'd1000000-0000-0000-0000-000000000001'
  and p.user_id = 'd0000000-0000-0000-0000-000000000001';

insert into public.batches (id, collection_id, organisation_id, code, weight_grams)
values
  ('d2000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'SUBASSIGN-MERGE-CODE', 250),
  ('d2000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'SUBASSIGN-MERGE-CODE', 170),
  ('d2000000-0000-0000-0000-000000000003', 'd7000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'SUBASSIGN-SAMPLE-CODE', 100),
  ('d2000000-0000-0000-0000-000000000004', 'd7000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'SUBASSIGN-LIFE-CODE', 90),
  ('d2000000-0000-0000-0000-000000000005', 'd7000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'SUBASSIGN-PARTIAL-RETURN', 60);

insert into public.batch_custody (batch_id, organisation_id)
select id, 'd1000000-0000-0000-0000-000000000001'
from public.batches
where id in (
  'd2000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000002',
  'd2000000-0000-0000-0000-000000000003',
  'd2000000-0000-0000-0000-000000000004',
  'd2000000-0000-0000-0000-000000000005'
);

insert into public.containers (id, organisation_id, name, purpose, active)
values
  ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'General mailing box', 'storage', true),
  ('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'General sample box', 'storage', true),
  ('d5000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', 'Testing retained vial', 'storage', true),
  -- Containers 4 and 5 exist so that container 1 is referenced by exactly one
  -- bag. The visibility matrix asserts that the assigned bag's container goes
  -- dark for Testing after close; sharing a container with a bag Testing still
  -- holds would make that cell true for the wrong reason.
  ('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 'General second box', 'storage', true),
  ('d5000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'General third box', 'storage', true);

insert into public.storage_locations (id, organisation_id, name, active)
values
  ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'General shelf', true),
  ('d4000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'Testing shelf', true);

insert into public.sub_batches (id, batch_id, container_id, weight_grams, notes)
values
  ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 100, 'Assigned visibility bag'),
  ('d3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000002', 150, 'General sibling bag'),
  ('d3000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000004', 80, 'First independently assigned bag'),
  ('d3000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000002', 90, 'Second independently assigned bag'),
  ('d3000000-0000-0000-0000-000000000005', 'd2000000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000002', 100, 'Adjusted sample source'),
  ('d3000000-0000-0000-0000-000000000006', 'd2000000-0000-0000-0000-000000000004', 'd5000000-0000-0000-0000-000000000005', 50, 'Quality-test lifecycle bag'),
  ('d3000000-0000-0000-0000-000000000007', 'd2000000-0000-0000-0000-000000000004', 'd5000000-0000-0000-0000-000000000002', 40, 'Unassigned lifecycle sibling'),
  ('d3000000-0000-0000-0000-000000000008', 'd2000000-0000-0000-0000-000000000005', 'd5000000-0000-0000-0000-000000000002', 60, 'Partial return lifecycle bag');

insert into public.batch_weight_adjustments (
  sub_batch_id,
  weight_grams,
  reason,
  created_by
)
values (
  'd3000000-0000-0000-0000-000000000005',
  -30,
  'Prepare adjusted sample source',
  'd0000000-0000-0000-0000-000000000001'
);

insert into public.batch_storage (
  id,
  batch_id,
  sub_batch_id,
  location_id,
  stored_at,
  notes
)
values
  ('d6000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', '2026-08-06 01:00:00+00', 'Assigned bag storage'),
  ('d6000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000001', '2026-08-06 01:01:00+00', 'Sibling storage'),
  ('d6000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000003', 'd4000000-0000-0000-0000-000000000001', '2026-08-06 01:02:00+00', 'First multi-bag storage'),
  ('d6000000-0000-0000-0000-000000000004', 'd2000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000001', '2026-08-06 01:03:00+00', 'Second multi-bag storage'),
  ('d6000000-0000-0000-0000-000000000005', 'd2000000-0000-0000-0000-000000000003', 'd3000000-0000-0000-0000-000000000005', 'd4000000-0000-0000-0000-000000000001', '2026-08-06 01:04:00+00', 'Sample source storage'),
  ('d6000000-0000-0000-0000-000000000006', 'd2000000-0000-0000-0000-000000000004', 'd3000000-0000-0000-0000-000000000006', 'd4000000-0000-0000-0000-000000000001', '2026-08-06 01:05:00+00', 'Lifecycle storage'),
  ('d6000000-0000-0000-0000-000000000007', 'd2000000-0000-0000-0000-000000000004', 'd3000000-0000-0000-0000-000000000007', 'd4000000-0000-0000-0000-000000000001', '2026-08-06 01:06:00+00', 'Lifecycle sibling storage'),
  ('d6000000-0000-0000-0000-000000000008', 'd2000000-0000-0000-0000-000000000005', 'd3000000-0000-0000-0000-000000000008', 'd4000000-0000-0000-0000-000000000001', '2026-08-06 01:07:00+00', 'Partial return lifecycle storage');

create temporary table multi_assignment_order (
  ordinal bigint generated always as identity,
  sub_batch_id uuid
);

create temporary table retained_result (id uuid);
create temporary table partial_return_result (
  transfer_event_id uuid,
  transfer_item_id uuid,
  source_sub_batch_id uuid,
  returned_sub_batch_id uuid,
  returned_weight_grams numeric
);
create temporary table final_return_result (
  transfer_event_id uuid,
  transfer_item_id uuid,
  source_sub_batch_id uuid,
  returned_sub_batch_id uuid,
  returned_weight_grams numeric
);
grant insert, select on multi_assignment_order, retained_result, partial_return_result, final_return_result to authenticated;

set local role authenticated;

-- A member may read inventory, but only a General Admin may create an
-- assignment.  The link itself does not grant write authority to a member.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Member","permissions":["inventory"]}}',
  true
);

select throws_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000002"}]'::jsonb
    )
  $$,
  '42501',
  null,
  'a General Member cannot assign a bag for testing'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000003',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000002"}]'::jsonb
    )
  $$,
  '42501',
  null,
  'an unlinked Testing organisation cannot receive a bag assignment'
);

-- Two bags from one parent may be active at the same time.  The request is
-- intentionally out of UUID order so the returned set order is observable.
select lives_ok(
  $$
    insert into multi_assignment_order (sub_batch_id)
    select sub_batch_id
    from public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000004"},
        {"sub_batch_id":"d3000000-0000-0000-0000-000000000003"}]'::jsonb
    )
  $$,
  'two bags from one parent can be assigned in one request'
);

select results_eq(
  $$
    select sub_batch_id
    from multi_assignment_order
    order by ordinal
  $$,
  $$
    values
      ('d3000000-0000-0000-0000-000000000003'::uuid),
      ('d3000000-0000-0000-0000-000000000004'::uuid)
  $$,
  'multi-bag assignment results are ordered by sub_batch_id'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where batch_id = 'd2000000-0000-0000-0000-000000000002'
      and closed_at is null
  ),
  2::bigint,
  'one parent may have two active bag assignments'
);

select results_eq(
  $$
    select count(distinct sti.transfer_event_id)::integer
    from public.batch_testing_assignment bta
    inner join public.seed_transfer_item sti
      on sti.id = bta.outbound_transfer_item_id
    where bta.batch_id = 'd2000000-0000-0000-0000-000000000002'
  $$,
  array[1],
  'one multi-bag assignment request creates one transfer header'
);

select results_eq(
  $$
    select count(*)::integer
    from public.seed_transfer_item sti
    where sti.transfer_event_id = (
      select sti2.transfer_event_id
      from public.batch_testing_assignment bta2
      inner join public.seed_transfer_item sti2
        on sti2.id = bta2.outbound_transfer_item_id
      where bta2.batch_id = 'd2000000-0000-0000-0000-000000000002'
      limit 1
    )
  $$,
  array[2],
  'the grouped transfer has one immutable item per moved bag'
);

select results_eq(
  $$
    select sti.weight_grams
    from public.batch_testing_assignment bta
    inner join public.seed_transfer_item sti
      on sti.id = bta.outbound_transfer_item_id
    where bta.batch_id = 'd2000000-0000-0000-0000-000000000002'
    order by sti.weight_grams
  $$,
  $$ values (80::numeric), (90::numeric) $$,
  'transfer items snapshot each dispatched bag weight'
);

select results_eq(
  $$
    select distinct
      ste.sender_org_id,
      ste.recipient_org_id,
      ste.kind::text,
      sti.owner_org_id
    from public.batch_testing_assignment bta
    inner join public.seed_transfer_item sti
      on sti.id = bta.outbound_transfer_item_id
    inner join public.seed_transfer_event ste
      on ste.id = sti.transfer_event_id
    where bta.batch_id = 'd2000000-0000-0000-0000-000000000002'
  $$,
  $$
    values (
      'd1000000-0000-0000-0000-000000000001'::uuid,
      'd1000000-0000-0000-0000-000000000002'::uuid,
      'testing_dispatch'::text,
      'd1000000-0000-0000-0000-000000000001'::uuid
    )
  $$,
  'the transfer snapshots sender, recipient, kind, and seed owner'
);

-- Testing work closes explicitly and remains independent from physical
-- custody. Corrections replace the current classification while preserving
-- every earlier declaration in append-only audit history.
select has_column(
  'public',
  'batch_testing_assignment',
  'work_closed_at',
  'assignments record when testing work closed'
);

select has_column(
  'public',
  'batch_testing_assignment',
  'work_status',
  'assignments record an explicit work outcome'
);

select has_column(
  'public',
  'batch_testing_assignment',
  'work_status_note',
  'assignments can explain a partial or incomplete outcome'
);

select has_column(
  'public',
  'batch_testing_assignment',
  'work_closed_by',
  'assignments record who first closed the work'
);

select has_table(
  'public',
  'batch_testing_assignment_status_audit',
  'assignment work status has an audit table'
);

select has_function(
  'public',
  'fn_set_testing_assignment_work_status',
  array['uuid', 'text', 'text'],
  'work status changes use one public RPC'
);

select throws_ok(
  $$
    select public.fn_set_testing_assignment_work_status(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'),
      'completed',
      null
    )
  $$,
  '42501',
  null,
  'the seed owner cannot close the provider assignment'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Member","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_set_testing_assignment_work_status(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'),
      'completed',
      null
    )
  $$,
  '42501',
  null,
  'a Testing Member cannot close or correct work status'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_set_testing_assignment_work_status(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'),
      'completed',
      null
    )
  $$,
  'a Testing Admin can close work as completed without a note'
);

select results_eq(
  $$
    select work_status
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  $$ values ('completed'::text) $$,
  'completed is stored as the current work outcome'
);

select results_eq(
  $$
    select work_closed_at is not null
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  $$ values (true) $$,
  'explicit work closure records its timestamp'
);

select results_eq(
  $$
    select work_closed_by
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  $$ values ('d0000000-0000-0000-0000-000000000003'::uuid) $$,
  'explicit work closure records its actor'
);

select results_eq(
  $$
    select count(*)
    from public.batch_testing_assignment_status_audit audit
    inner join public.batch_testing_assignment assignment
      on assignment.id = audit.assignment_id
    where assignment.sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
      and audit.old_work_status is null
      and audit.new_work_status = 'completed'
  $$,
  $$ values (1::bigint) $$,
  'initial work closure appends its audit fact'
);

select throws_ok(
  $$
    select public.fn_set_testing_assignment_work_status(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'),
      'partially_completed',
      '   '
    )
  $$,
  '22023',
  null,
  'partial completion requires a nonblank note'
);

select lives_ok(
  $$
    select public.fn_set_testing_assignment_work_status(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'),
      'partially_completed',
      'Only viability testing was completed'
    )
  $$,
  'a Testing Admin can correct completed work to partially completed'
);

select results_eq(
  $$
    select work_status, work_status_note
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  $$
    values (
      'partially_completed'::text,
      'Only viability testing was completed'::text
    )
  $$,
  'the corrected work outcome and note become current'
);

select results_eq(
  $$
    select count(*)
    from public.batch_testing_assignment_status_audit audit
    inner join public.batch_testing_assignment assignment
      on assignment.id = audit.assignment_id
    where assignment.sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
      and audit.old_work_status = 'completed'
      and audit.new_work_status = 'partially_completed'
      and audit.note = 'Only viability testing was completed'
  $$,
  $$ values (1::bigint) $$,
  'a status correction appends the old and new outcomes'
);

select lives_ok(
  $$
    select public.fn_set_testing_assignment_work_status(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'),
      'not_completed',
      'Sample was unsuitable for the requested work'
    )
  $$,
  'a Testing Admin can classify work as not completed with a note'
);

select results_eq(
  $$
    select work_status
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  $$ values ('not_completed'::text) $$,
  'not completed is stored as the current work outcome'
);

select results_eq(
  $$
    select count(*)
    from public.batch_testing_assignment_status_audit audit
    inner join public.batch_testing_assignment assignment
      on assignment.id = audit.assignment_id
    where assignment.sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
      and audit.old_work_status = 'partially_completed'
      and audit.new_work_status = 'not_completed'
  $$,
  $$ values (1::bigint) $$,
  'the second correction also preserves its predecessor'
);

select results_eq(
  $$
    select count(*)
    from public.batch_testing_assignment_status_audit audit
    inner join public.batch_testing_assignment assignment
      on assignment.id = audit.assignment_id
    where assignment.sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  $$ values (3::bigint) $$,
  'all work status declarations remain in audit history'
);

reset role;

select throws_ok(
  $$
    update public.batch_testing_assignment
    set work_status_note = null
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  '23514',
  null,
  'the table rejects a missing note for not-completed work'
);

select throws_ok(
  $$
    update public.batch_testing_assignment_status_audit
    set note = 'attempted rewrite'
    where assignment_id = (
      select id
      from public.batch_testing_assignment
      where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
    )
  $$,
  '55000',
  null,
  'work status audit history is append-only even to privileged callers'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    update public.seed_transfer_event
    set reason = 'attempted rewrite'
    where sender_org_id = 'd1000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated senders cannot update immutable transfer headers'
);

select throws_ok(
  $$
    delete from public.seed_transfer_item
    where owner_org_id = 'd1000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated owners cannot delete immutable transfer items'
);

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000003'
  ),
  'd1000000-0000-0000-0000-000000000002'::uuid,
  'the first assigned bag moves to Testing ownership'
);

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000004'
  ),
  'd1000000-0000-0000-0000-000000000002'::uuid,
  'the second assigned bag moves to Testing ownership'
);

select lives_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000001"}]'::jsonb
    )
  $$,
  'a General Admin can assign one bag'
);

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000001'
  ),
  'd1000000-0000-0000-0000-000000000002'::uuid,
  'the assigned bag is held by Testing'
);

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000002'
  ),
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'assigning one bag leaves its sibling with the General organisation'
);

select is(
  (
    select count(*)
    from public.batch_custody
    where batch_id = 'd2000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'assigning a bag writes no batch_custody row'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
      and moved_out_at is null
  ),
  0::bigint,
  'assignment removes the assigned bag from storage'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000002'
      and moved_out_at is null
  ),
  1::bigint,
  'assignment leaves the sibling storage row untouched'
);

-- The source currently weighs 70g after its -30g adjustment.  The first call
-- must validate against that effective weight, not the original 100g.
select throws_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000005","sample_weight_grams":70}]'::jsonb
    )
  $$,
  '22023',
  null,
  'a sample equal to the adjusted source weight is rejected'
);

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = 'd3000000-0000-0000-0000-000000000005'
  ),
  70::numeric,
  'a rejected sample request leaves the adjusted source weight unchanged'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where batch_id = 'd2000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'a rejected sample request leaves no assignment behind'
);

select lives_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000005","sample_weight_grams":40,"container_id":"d5000000-0000-0000-0000-000000000002"}]'::jsonb
    )
  $$,
  'a valid adjusted-weight sample splits and assigns the child bag'
);

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = 'd3000000-0000-0000-0000-000000000005'
  ),
  30::numeric,
  'the sample split deducts its weight from the source'
);

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = (
      select sub_batch_id
      from public.batch_testing_assignment
      where batch_id = 'd2000000-0000-0000-0000-000000000003'
    )
  ),
  40::numeric,
  'the assigned sample child has the requested current weight'
);

select is(
  (
    select sum(current_weight)
    from public.sub_batch_current_weight
    where id in (
      'd3000000-0000-0000-0000-000000000005',
      (select sub_batch_id from public.batch_testing_assignment where batch_id = 'd2000000-0000-0000-0000-000000000003')
    )
  ),
  70::numeric,
  'sample splitting conserves the adjusted source weight'
);

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = (
      select sub_batch_id
      from public.batch_testing_assignment
      where batch_id = 'd2000000-0000-0000-0000-000000000003'
    )
  ),
  'd1000000-0000-0000-0000-000000000002'::uuid,
  'the split sample child is held by Testing'
);

select is(
  (
    select container_id
    from public.sub_batches
    where id = (
      select sub_batch_id
      from public.batch_testing_assignment
      where batch_id = 'd2000000-0000-0000-0000-000000000003'
    )
  ),
  'd5000000-0000-0000-0000-000000000002'::uuid,
  'the mailing container is attached to the assigned child'
);

select is(
  (
    select count(*)
    from public.batch_storage
    where sub_batch_id = (
      select sub_batch_id
      from public.batch_testing_assignment
      where batch_id = 'd2000000-0000-0000-0000-000000000003'
    )
  ),
  0::bigint,
  'a split child sent by mail has no storage row'
);

select throws_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000001"}]'::jsonb
    )
  $$,
  '55000',
  null,
  'the same bag cannot receive a second active assignment'
);

select throws_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000002"},
        {"sub_batch_id":"d3000000-0000-0000-0000-000000000002"}]'::jsonb
    )
  $$,
  '22023',
  null,
  'a request cannot name the same bag twice'
);

select throws_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"not-a-uuid"}]'::jsonb
    )
  $$,
  '22023',
  null,
  'a malformed bag ID is rejected'
);

select throws_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{}]'::jsonb
    )
  $$,
  '22023',
  null,
  'an assignment item without a bag ID is rejected'
);

select throws_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000002"},
        {"sub_batch_id":"d3000000-0000-0000-0000-000000009999"}]'::jsonb
    )
  $$,
  'P0002',
  null,
  'a partially valid request rolls back when one bag is missing'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where batch_id = 'd2000000-0000-0000-0000-000000000001'
      and sub_batch_id = 'd3000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'the partially valid request wrote no sibling assignment'
);

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000002'
  ),
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'the partially valid request did not move the sibling bag'
);

-- Direct writes must not become an alternate custody or assignment boundary.
reset role;

insert into public.batch_storage (
  id,
  batch_id,
  sub_batch_id,
  location_id,
  stored_at,
  notes
)
values (
  'd6000000-0000-0000-0000-000000000099',
  'd2000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000002',
  '2026-08-06 02:00:00+00',
  'Owner write probe'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    update public.sub_batches
    set notes = 'Owner attempted edit'
    where id = 'd3000000-0000-0000-0000-000000000001'
  $$,
  'an owner cannot directly update a Testing-held bag'
);

select is(
  (
    select notes
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000001'
  ),
  'Assigned visibility bag'::text,
  'a direct owner bag update changes no state'
);

select lives_ok(
  $$
    delete from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000001'
  $$,
  'an owner cannot directly delete a Testing-held bag'
);

select is(
  (
    select count(*)
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'a direct owner bag delete changes no state'
);

select throws_ok(
  $$
    update public.sub_batches
    set held_by_org_id = 'd1000000-0000-0000-0000-000000000001'
    where id = 'd3000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'an owner cannot directly rewrite held_by_org_id'
);

select throws_ok(
  $$
    insert into public.batch_weight_adjustments (
      sub_batch_id,
      weight_grams,
      reason,
      created_by
    ) values (
      'd3000000-0000-0000-0000-000000000001',
      -1,
      'Owner write probe',
      'd0000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'an owner cannot directly adjust a Testing-held bag'
);

select throws_ok(
  $$
    insert into public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id,
      notes
    ) values (
      'd2000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000001',
      'd4000000-0000-0000-0000-000000000001',
      'Owner write probe'
    )
  $$,
  -- 23514, not 42501: a BEFORE INSERT trigger runs ahead of the RLS WITH CHECK,
  -- so validate_active_storage_location rejects the row first. The location
  -- belongs to General while the bag is held by Testing. Either way the write
  -- is refused; this records which guard actually fires.
  '23514',
  null,
  'an owner cannot directly store a Testing-held bag'
);

select lives_ok(
  $$
    update public.batch_storage
    set notes = 'Owner attempted storage edit'
    where id = 'd6000000-0000-0000-0000-000000000099'
  $$,
  'an owner cannot directly update Testing-held storage'
);

select is(
  (
    select notes
    from public.batch_storage
    where id = 'd6000000-0000-0000-0000-000000000099'
  ),
  'Owner write probe'::text,
  'a direct owner storage update changes no state'
);

select throws_ok(
  $$
    insert into public.batch_testing_assignment (
      batch_id,
      sub_batch_id,
      assigned_to_org_id,
      assigned_by_org_id
    ) values (
      'd2000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000002',
      'd1000000-0000-0000-0000-000000000002',
      'd1000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'a direct assignment INSERT is rejected'
);

select lives_ok(
  $$
    update public.batch_testing_assignment
    set completed_at = now()
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
  $$,
  'a direct assignment UPDATE runs but cannot mutate the row'
);

select lives_ok(
  $$
    delete from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
  $$,
  'a direct assignment DELETE runs but cannot remove the row'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'a direct assignment INSERT stored no row'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
      and completed_at is null
      and closed_at is null
  ),
  1::bigint,
  'direct assignment UPDATE and DELETE changed nothing'
);

select throws_ok(
  $$
    insert into public.treatments (
      input_batch_id,
      output_batch_id,
      treat,
      quality_assessment,
      created_by,
      organisation_id
    ) values (
      null,
      'd2000000-0000-0000-0000-000000000001',
      '["sort"]'::jsonb,
      'ORG',
      'd0000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'a direct treatments INSERT is rejected'
);

reset role;

delete from public.batch_storage
where id = 'd6000000-0000-0000-0000-000000000099';

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    insert into public.tests (
      id,
      batch_id,
      sub_batch_id,
      performed_by_organisation_id,
      type,
      result,
      tested_by
    ) values (
      'd7000000-0000-0000-0000-000000000002',
      'd2000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000002',
      'd1000000-0000-0000-0000-000000000002',
      'quality',
      '{"status":"direct-write-probe"}',
      'd0000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  null,
  'a Testing user cannot directly insert a test for a sibling bag'
);

-- The consuming operations reject an active assignment rather than moving it
-- to a successor or closing it implicitly.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_clean_sub_batch(
      'd3000000-0000-0000-0000-000000000001',
      null::interval,
      'seed',
      null,
      null,
      false,
      null,
      '{}'::uuid[],
      '[{"quality":"ORG","material_type":"seed","weight_grams":1}]'::jsonb
    )
  $$,
  'P0001',
  null,
  'cleaning an assigned bag is rejected'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_merge_sub_batches(
      array[
        'd3000000-0000-0000-0000-000000000003',
        'd3000000-0000-0000-0000-000000000004'
      ]::uuid[],
      'd5000000-0000-0000-0000-000000000003',
      null
    )
  $$,
  'assigned bags can merge because the destination preserves their ancestry'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_merge_batches(
      array[
        'd2000000-0000-0000-0000-000000000001',
        'd2000000-0000-0000-0000-000000000002'
      ]::uuid[],
      'Assigned material merge probe'
    )
  $$,
  'P0001',
  null,
  'whole-batch merge is rejected while source bags are assigned'
);

select lives_ok(
  $$
    delete from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000001'
  $$,
  'direct bag deletion cannot delete assigned material'
);

select is(
  (
    select count(*)
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'assigned material remains after a direct bag deletion attempt'
);

select lives_ok(
  $$
    delete from public.batches
    where id = 'd2000000-0000-0000-0000-000000000001'
  $$,
  'parent batch deletion is rejected while a bag is assigned'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where batch_id = 'd2000000-0000-0000-0000-000000000001'
      and sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'no active assignment points at deleted material'
);

-- A quality test leaves work open until it consumes all represented seed,
-- rejects sibling access, and protects the bag from over-consumption.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000006"}]'::jsonb
    )
  $$,
  'the lifecycle bag can be assigned'
);

select lives_ok(
  $$
    select public.fn_assign_bags_for_testing(
      'd1000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000008"}]'::jsonb
    )
  $$,
  'the partial-return lifecycle bag can be assigned'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into partial_return_result
    select *
    from public.fn_return_bags_from_testing(
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000008","weight_grams":25}]'::jsonb,
      'partially_completed',
      'Only viability testing was completed'
    )
  $$,
  'Testing can return part of a held bag and explicitly close its work'
);

reset role;

select results_eq(
  $$
    select fact, value
    from (
      values
        (
          'assignment_lineage_count'::text,
          (
            select count(*)::text
            from partial_return_result result
            cross join lateral public.fn_resolve_testing_assignments_for_sub_batch(
              result.returned_sub_batch_id
            ) resolved
          )
        ),
        (
          'result_count'::text,
          (select count(*)::text from partial_return_result)
        ),
        (
          'return_assignment_link_count'::text,
          (
            select count(*)::text
            from partial_return_result result
            inner join public.batch_testing_assignment_return_item link
              on link.transfer_item_id = result.transfer_item_id
          )
        ),
        (
          'return_event'::text,
          coalesce((
            select concat_ws(
              '|',
              event.kind::text,
              event.sender_org_id::text,
              event.recipient_org_id::text
            )
            from partial_return_result result
            inner join public.seed_transfer_event event
              on event.id = result.transfer_event_id
          ), 'missing')
        ),
        (
          'returned_container_is_null'::text,
          coalesce((
            select (bag.container_id is null)::text
            from partial_return_result result
            inner join public.sub_batches bag
              on bag.id = result.returned_sub_batch_id
          ), 'missing')
        ),
        (
          'returned_holder'::text,
          coalesce((
            select bag.held_by_org_id::text
            from partial_return_result result
            inner join public.sub_batches bag
              on bag.id = result.returned_sub_batch_id
          ), 'missing')
        ),
        (
          'returned_open_storage_count'::text,
          (
            select count(*)::text
            from partial_return_result result
            inner join public.batch_storage storage
              on storage.sub_batch_id = result.returned_sub_batch_id
              and storage.moved_out_at is null
          )
        ),
        (
          'returned_weight'::text,
          coalesce((
            select weight.current_weight::text
            from partial_return_result result
            inner join public.sub_batch_current_weight weight
              on weight.id = result.returned_sub_batch_id
          ), 'missing')
        ),
        (
          'source_holder'::text,
          (
            select bag.held_by_org_id::text
            from public.sub_batches bag
            where bag.id = 'd3000000-0000-0000-0000-000000000008'
          )
        ),
        (
          'source_weight'::text,
          (
            select weight.current_weight::text
            from public.sub_batch_current_weight weight
            where weight.id = 'd3000000-0000-0000-0000-000000000008'
          )
        ),
        (
          'work_outcome'::text,
          (
            select concat_ws('|', assignment.work_status, assignment.work_status_note)
            from public.batch_testing_assignment assignment
            where assignment.sub_batch_id = 'd3000000-0000-0000-0000-000000000008'
          )
        )
    ) observed(fact, value)
    order by fact
  $$,
  $$
    select fact, value
    from (
      values
        ('assignment_lineage_count'::text, '1'::text),
        ('result_count'::text, '1'::text),
        ('return_assignment_link_count'::text, '1'::text),
        ('return_event'::text, 'return|d1000000-0000-0000-0000-000000000002|d1000000-0000-0000-0000-000000000001'::text),
        ('returned_container_is_null'::text, 'true'::text),
        ('returned_holder'::text, 'd1000000-0000-0000-0000-000000000001'::text),
        ('returned_open_storage_count'::text, '0'::text),
        ('returned_weight'::text, '25'::text),
        ('source_holder'::text, 'd1000000-0000-0000-0000-000000000002'::text),
        ('source_weight'::text, '35'::text),
        ('work_outcome'::text, 'partially_completed|Only viability testing was completed'::text)
    ) expected(fact, value)
    order by fact
  $$,
  'a partial return separates custody from closed work and preserves lineage'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into partial_return_result
    select *
    from public.fn_return_bags_from_testing(
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000008","weight_grams":10}]'::jsonb
    )
  $$,
  'Testing can return another portion after its work is already closed'
);

reset role;

select results_eq(
  $$
    select fact, value
    from (
      values
        (
          'return_assignment_link_count'::text,
          (
            select count(*)::text
            from partial_return_result result
            inner join public.batch_testing_assignment_return_item link
              on link.transfer_item_id = result.transfer_item_id
          )
        ),
        (
          'return_event_count'::text,
          (
            select count(distinct result.transfer_event_id)::text
            from partial_return_result result
          )
        ),
        (
          'returned_portion_count'::text,
          (select count(*)::text from partial_return_result)
        ),
        (
          'second_return'::text,
          coalesce((
            select concat_ws(
              '|',
              weight.current_weight::text,
              bag.held_by_org_id::text,
              (bag.container_id is null)::text
            )
            from partial_return_result result
            inner join public.sub_batches bag
              on bag.id = result.returned_sub_batch_id
            inner join public.sub_batch_current_weight weight
              on weight.id = bag.id
            where result.returned_weight_grams = 10
          ), 'missing')
        ),
        (
          'source_remainder'::text,
          (
            select concat_ws('|', weight.current_weight, bag.held_by_org_id)
            from public.sub_batches bag
            inner join public.sub_batch_current_weight weight
              on weight.id = bag.id
            where bag.id = 'd3000000-0000-0000-0000-000000000008'
          )
        ),
        (
          'work_audit_count'::text,
          (
            select count(*)::text
            from public.batch_testing_assignment_status_audit audit
            inner join public.batch_testing_assignment assignment
              on assignment.id = audit.assignment_id
            where assignment.sub_batch_id = 'd3000000-0000-0000-0000-000000000008'
          )
        ),
        (
          'work_outcome'::text,
          (
            select concat_ws('|', assignment.work_status, assignment.work_status_note)
            from public.batch_testing_assignment assignment
            where assignment.sub_batch_id = 'd3000000-0000-0000-0000-000000000008'
          )
        )
    ) observed(fact, value)
    order by fact
  $$,
  $$
    select fact, value
    from (
      values
        ('return_assignment_link_count'::text, '2'::text),
        ('return_event_count'::text, '2'::text),
        ('returned_portion_count'::text, '2'::text),
        ('second_return'::text, '10|d1000000-0000-0000-0000-000000000001|true'::text),
        ('source_remainder'::text, '25|d1000000-0000-0000-0000-000000000002'::text),
        ('work_audit_count'::text, '1'::text),
        ('work_outcome'::text, 'partially_completed|Only viability testing was completed'::text)
    ) expected(fact, value)
    order by fact
  $$,
  'a repeated return moves only the new portion and leaves work closure unchanged'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select *
    from public.fn_return_bags_from_testing(
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000008","weight_grams":22}]'::jsonb,
      null,
      null,
      true,
      null
    )
  $$,
  '22023',
  null,
  'a final return with a weight shortage requires a variance reason'
);

select lives_ok(
  $$
    insert into final_return_result
    select *
    from public.fn_return_bags_from_testing(
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000008","weight_grams":22}]'::jsonb,
      null,
      null,
      true,
      'Three grams could not be reconciled at final weighing'
    )
  $$,
  'Testing can acknowledge a final shortage after earlier partial returns'
);

reset role;

select results_eq(
  $$
    select fact, value
    from (
      values
        (
          'conserved_weight'::text,
          (
            select (
              coalesce(sum(returned_weight_grams), 0)
              + (select coalesce(sum(returned_weight_grams), 0) from final_return_result)
              + (
                select weight.current_weight
                from public.sub_batch_current_weight weight
                where weight.id = 'd3000000-0000-0000-0000-000000000008'
              )
              - coalesce((
                select sum(adjustment.weight_grams)
                from public.batch_weight_adjustments adjustment
                where adjustment.sub_batch_id = 'd3000000-0000-0000-0000-000000000008'
                  and adjustment.kind = 'variance'
              ), 0)
            )::text
            from partial_return_result
          )
        ),
        (
          'final_return'::text,
          coalesce((
            select concat_ws(
              '|',
              weight.current_weight::text,
              bag.held_by_org_id::text,
              (bag.container_id is null)::text
            )
            from final_return_result result
            inner join public.sub_batches bag
              on bag.id = result.returned_sub_batch_id
            inner join public.sub_batch_current_weight weight
              on weight.id = bag.id
          ), 'missing')
        ),
        (
          'return_assignment_link_count'::text,
          (
            select (
              (select count(*) from partial_return_result partial_result
                inner join public.batch_testing_assignment_return_item partial_link
                  on partial_link.transfer_item_id = partial_result.transfer_item_id)
              +
              (select count(*) from final_return_result final_result
                inner join public.batch_testing_assignment_return_item final_link
                  on final_link.transfer_item_id = final_result.transfer_item_id)
            )::text
          )
        ),
        (
          'return_event_count'::text,
          (
            select count(distinct movement.transfer_event_id)::text
            from (
              select transfer_event_id from partial_return_result
              union all
              select transfer_event_id from final_return_result
            ) movement
          )
        ),
        (
          'source_weight'::text,
          (
            select weight.current_weight::text
            from public.sub_batch_current_weight weight
            where weight.id = 'd3000000-0000-0000-0000-000000000008'
          )
        ),
        (
          'work_audit_count'::text,
          (
            select count(*)::text
            from public.batch_testing_assignment_status_audit audit
            inner join public.batch_testing_assignment assignment
              on assignment.id = audit.assignment_id
            where assignment.sub_batch_id = 'd3000000-0000-0000-0000-000000000008'
          )
        ),
        (
          'variance'::text,
          coalesce((
            select concat_ws(
              '|',
              adjustment.weight_grams,
              adjustment.reason,
              (adjustment.transfer_item_id = result.transfer_item_id)::text
            )
            from final_return_result result
            inner join public.batch_weight_adjustments adjustment
              on adjustment.transfer_item_id = result.transfer_item_id
              and adjustment.kind = 'variance'
          ), 'missing')
        )
    ) observed(fact, value)
    order by fact
  $$,
  $$
    select fact, value
    from (
      values
        ('conserved_weight'::text, '60'::text),
        ('final_return'::text, '22|d1000000-0000-0000-0000-000000000001|true'::text),
        ('return_assignment_link_count'::text, '3'::text),
        ('return_event_count'::text, '3'::text),
        ('source_weight'::text, '0'::text),
        ('variance'::text, '-3|Three grams could not be reconciled at final weighing|true'::text),
        ('work_audit_count'::text, '1'::text)
    ) expected(fact, value)
    order by fact
  $$,
  'an acknowledged shortage ends positive lab custody with immutable variance accounting'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select *
    from public.fn_return_bags_from_testing(
      '[{"sub_batch_id":"d3000000-0000-0000-0000-000000000008"}]'::jsonb
    )
  $$,
  '22023',
  null,
  'a fully returned lab source cannot be returned again'
);

select lives_ok(
  $$
    select public.fn_create_quality_test(
      'd2000000-0000-0000-0000-000000000004',
      'd3000000-0000-0000-0000-000000000006',
      '{"repeats":[{"weight_grams":10}]}'::jsonb,
      'd1000000-0000-0000-0000-000000000002'
    )
  $$,
  'Testing can create a quality test for its assigned bag'
);

select is(
  (
    select count(*)
    from public.batch_weight_adjustments adjustment
    inner join public.tests test ON test.id = adjustment.test_id
    where adjustment.sub_batch_id =
      'd3000000-0000-0000-0000-000000000006'
      and test.sub_batch_id = adjustment.sub_batch_id
      and adjustment.kind = 'test_consumption'
  ),
  1::bigint,
  'test consumption references the test that deducted the weight'
);

select is(
  (
    select work_closed_at
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000006'
  ),
  null,
  'the first quality test leaves its work open'
);

select is(
  (
    select work_closed_at
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
  ),
  null,
  'a quality test closes no other assignment'
);

select throws_ok(
  $$
    select public.fn_create_quality_test(
      'd2000000-0000-0000-0000-000000000004',
      'd3000000-0000-0000-0000-000000000007',
      '{"repeats":[{"weight_grams":1}]}'::jsonb,
      'd1000000-0000-0000-0000-000000000002'
    )
  $$,
  '42501',
  null,
  'Testing cannot test an unassigned sibling bag'
);

select is(
  (
    select count(*)
    from public.tests
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000007'
  ),
  0::bigint,
  'a rejected sibling test writes no test row'
);

select is(
  (
    select count(*)
    from public.batch_weight_adjustments
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000007'
  ),
  0::bigint,
  'a rejected sibling test writes no weight adjustment'
);

select throws_ok(
  $$
    select public.fn_create_quality_test(
      'd2000000-0000-0000-0000-000000000004',
      'd3000000-0000-0000-0000-000000000006',
      '{"repeats":[{"weight_grams":41}]}'::jsonb,
      'd1000000-0000-0000-0000-000000000002'
    )
  $$,
  '22023',
  null,
  'over-consumption of a bag is rejected'
);

select is(
  (
    select count(*)
    from public.tests
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000006'
  ),
  1::bigint,
  'over-consumption writes no second test'
);

select is(
  (
    select count(*)
    from public.batch_weight_adjustments
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000006'
  ),
  1::bigint,
  'over-consumption writes no second adjustment'
);

select lives_ok(
  $$
    select public.fn_create_quality_test(
      'd2000000-0000-0000-0000-000000000004',
      'd3000000-0000-0000-0000-000000000006',
      '{"repeats":[{"weight_grams":40}]}'::jsonb,
      'd1000000-0000-0000-0000-000000000002'
    )
  $$,
  'consuming exactly the remaining bag weight succeeds'
);

select is(
  (
    select work_status
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000006'
  ),
  'completed'::text,
  'zero remaining weight closes the work as completed'
);

select isnt(
  (
    select work_closed_at
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000006'
  ),
  null,
  'automatically completed work records its closure timestamp'
);

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = 'd3000000-0000-0000-0000-000000000006'
  ),
  0::numeric,
  'the consumed bag has no current weight'
);

select throws_ok(
  $$
    select public.fn_return_bag_from_testing(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000006')
    )
  $$,
  '55000',
  null,
  'a consumed assignment cannot be returned'
);

-- Testing splits an assigned bag.  The child is Testing-owned and remains so
-- when the assigned parent bag is returned to General.
select lives_ok(
  $$
    insert into retained_result (id)
    select unnest(public.fn_split_sub_batch(
      'd3000000-0000-0000-0000-000000000001',
      '[{"weight_grams":20,"container_id":"d5000000-0000-0000-0000-000000000003"}]'::jsonb
    ))
  $$,
  'Testing can split an assigned bag'
);

select is(
  (
    select count(*)
    from retained_result
  ),
  1::bigint,
  'the Testing split creates one retained child bag'
);

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = (select id from retained_result limit 1)
  ),
  'd1000000-0000-0000-0000-000000000002'::uuid,
  'a child split by Testing is held by Testing'
);

select is(
  (
    select container_id
    from public.sub_batches
    where id = (select id from retained_result limit 1)
  ),
  'd5000000-0000-0000-0000-000000000003'::uuid,
  'the retained child keeps its Testing container'
);

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = 'd3000000-0000-0000-0000-000000000001'
  ),
  80::numeric,
  'splitting deducts the retained weight from the assigned bag'
);

select is(
  (
    select current_weight
    from public.sub_batch_current_weight
    where id = (select id from retained_result limit 1)
  ),
  20::numeric,
  'the retained child has its split weight'
);

select results_eq(
  $$
    select resolved.assignment_id
    from retained_result result
    cross join lateral
      public.fn_resolve_testing_assignments_for_sub_batch(result.id) resolved
  $$,
  $$
    select id
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
  $$,
  'a split child resolves the assignment represented by its source bag'
);

select is(
  (
    select count(*)
    from public.batch_weight_adjustments adjustment
    inner join public.sub_batch_lineage lineage
      on lineage.source_sub_batch_id = adjustment.sub_batch_id
      and lineage.operation_id = adjustment.lineage_operation_id
      and lineage.operation_kind = 'split'
    where adjustment.sub_batch_id =
      'd3000000-0000-0000-0000-000000000001'
      and adjustment.kind = 'split'
  ),
  1::bigint,
  'a split deduction references the same structured operation as lineage'
);

-- This historical row is General-authored on purpose.  It proves that an
-- active assignment grants the test row to both organisations, while the
-- closed-assignment matrix does not accidentally inherit Testing's
-- performing-organisation exception.
reset role;

insert into public.tests (
  id,
  batch_id,
  sub_batch_id,
  performed_by_organisation_id,
  type,
  result,
  tested_by
)
values (
  'd7000000-0000-0000-0000-000000000003',
  'd2000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'quality',
  '{"status":"historical-general-result"}',
  'd0000000-0000-0000-0000-000000000001'
);

set local role authenticated;

-- Visibility matrix: each results_eq assertion contains all eight cells for
-- one reader/state.  The order is assigned bag, sibling, retained bag, parent
-- batch, test, assigned container, General storage location, assignment row.
--
-- One cell needs explaining.  After the assignment closes, Testing still sees
-- the parent batch -- because it still holds the bag it retained, and a split
-- child sits under the same parent.  Parent metadata is what makes a retained
-- bag intelligible: an organisation holding seed must be able to see what
-- species and collection it came from.  Visibility ends only when Testing holds
-- nothing of that batch at all.
--
-- The test row below is deliberately one General performed, so the "test"
-- column genuinely goes dark for Testing after close.  A Testing-performed test
-- stays visible to its author for good, via the performing-organisation arm of
-- tests_select -- that is Plan 003 behaviour and is asserted separately.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[1, 1, 0, 1, 1, 1, 1, 1],
  'General owner sees every active access-model cell'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Member","permissions":["inventory"]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[1, 1, 0, 1, 1, 1, 1, 1],
  'General member sees every active access-model cell'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[1, 0, 1, 1, 1, 1, 0, 1],
  'Testing admin sees every active access-model cell'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Member","permissions":["inventory"]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[1, 0, 1, 1, 1, 1, 0, 1],
  'Testing member sees every active access-model cell'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000003","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[0, 0, 0, 0, 0, 0, 0, 0],
  'another organisation sees no active access-model cell'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_return_bag_from_testing(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001')
    )
  $$,
  'Testing can return the assigned parent bag'
);

select is(
  (
    select outcome
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
  ),
  'returned'::text,
  'a returned assignment records the returned outcome'
);

select isnt(
  (
    select closed_at
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'
  ),
  null,
  'a returned assignment records closed_at'
);

-- The returned bag and the batch's custody history are read as General from
-- here. Testing has just handed the bag back, so it can no longer see either --
-- which is the visibility rule working, not a gap in it. Reading them under the
-- Testing JWT would return NULL and zero rows and prove nothing about what the
-- return actually wrote. The retained child is checked before the switch,
-- because that one Testing genuinely still holds.
select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = (select id from retained_result limit 1)
  ),
  'd1000000-0000-0000-0000-000000000002'::uuid,
  'returning the parent does not move the retained Testing child'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select is(
  (
    select held_by_org_id
    from public.sub_batches
    where id = 'd3000000-0000-0000-0000-000000000001'
  ),
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'return restores the assigned bag to the General owner'
);

select is(
  (
    select count(*)
    from public.batch_custody
    where batch_id = 'd2000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'returning a bag writes no batch_custody row'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    select public.fn_return_bag_from_testing(
      (select id from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000003')
    )
  $$,
  'returning one assignment succeeds while another parent bag remains active'
);

select is(
  (
    select outcome
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000003'
  ),
  'returned'::text,
  'the first multi-bag assignment is closed as returned'
);

select is(
  (
    select count(*)
    from public.batch_testing_assignment
    where sub_batch_id = 'd3000000-0000-0000-0000-000000000004'
      and closed_at is null
  ),
  1::bigint,
  'returning one bag leaves the other assignment active'
);

-- Custody-relative weight views must describe different physical holdings to
-- General and Testing, both before and after the return.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select is(
  (
    select current_weight
    from public.batch_current_weight
    where id = 'd2000000-0000-0000-0000-000000000001'
  ),
  230::numeric,
  'General sees the returned bag and its sibling in current batch weight'
);

select is(
  (
    select count(*)
    from public.active_sub_batches
    where batch_id = 'd2000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'General active_sub_batches excludes no General-held bag'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select is(
  (
    select current_weight
    from public.batch_current_weight
    where id = 'd2000000-0000-0000-0000-000000000001'
  ),
  20::numeric,
  'Testing sees only the retained bag in current batch weight after close'
);

select is(
  (
    select count(*)
    from public.active_sub_batches
    where batch_id = 'd2000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'Testing active_sub_batches excludes the returned parent and General sibling'
);

-- Closed visibility matrix.  The retained child stays readable to Testing
-- forever, while the assignment row remains historical for both parties.
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[1, 1, 0, 1, 1, 1, 1, 1],
  'General owner sees every closed access-model cell'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000001","role":"Member","permissions":["inventory"]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[1, 1, 0, 1, 1, 1, 1, 1],
  'General member sees every closed access-model cell'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[0, 0, 1, 1, 0, 0, 0, 1],
  'Testing admin keeps the retained bag, its parent batch and the closed assignment after close'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000002","role":"Member","permissions":["inventory"]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[0, 0, 1, 1, 0, 0, 0, 1],
  'Testing member keeps the retained bag, its parent batch and the closed assignment after close'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"org_id":"d1000000-0000-0000-0000-000000000003","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    values
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.sub_batches where id = 'd3000000-0000-0000-0000-000000000002')),
      ((select count(*)::integer from public.sub_batches where id = (select id from retained_result limit 1))),
      ((select count(*)::integer from public.batches where id = 'd2000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.tests where id = 'd7000000-0000-0000-0000-000000000003')),
      ((select count(*)::integer from public.containers where id = 'd5000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.storage_locations where id = 'd4000000-0000-0000-0000-000000000001')),
      ((select count(*)::integer from public.batch_testing_assignment where sub_batch_id = 'd3000000-0000-0000-0000-000000000001'))
  $$,
  array[0, 0, 0, 0, 0, 0, 0, 0],
  'another organisation sees no closed access-model cell'
);

reset role;

select * from finish();

rollback;
