begin;

create extension if not exists pgtap with schema extensions;

select plan(227);

-- Ownership transfer (plan 2026-11-18-transfer.md, section 5): lifecycle,
-- reservations, link isolation, opt-out, rejections, replay and visibility.
-- Provenance, test and storage snapshots, onward transfer and cleaning live in
-- ownership_transfer_provenance.sql. The two-session cases live in
-- concurrency/ownership_transfer_concurrency.md.
--
-- Organisations: A sends; B recipient that links on first send; C and F hold an
-- accepted transfer link from A; D and H are further senders (collectionless
-- batches); E never opts in; L is a testing provider that also opts in.

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'xfer-a-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'xfer-a-inv@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'xfer-a-noinv@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'xfer-b-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'xfer-b-member@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'xfer-c-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'xfer-d-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'xfer-e-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'xfer-f-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'xfer-h-admin@test.invalid'),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'xfer-l-admin@test.invalid');

insert into public.organisation (id, name, owner_id, is_testing_provider, accepts_transfers)
values
  ('7b000000-0000-0000-0000-000000000001', 'Xfer A sender', '7a000000-0000-0000-0000-000000000001', false, false),
  ('7b000000-0000-0000-0000-000000000002', 'Xfer B recipient', '7a000000-0000-0000-0000-000000000004', false, true),
  ('7b000000-0000-0000-0000-000000000003', 'Xfer C linked', '7a000000-0000-0000-0000-000000000006', false, true),
  ('7b000000-0000-0000-0000-000000000004', 'Xfer D sender two', '7a000000-0000-0000-0000-000000000007', false, true),
  ('7b000000-0000-0000-0000-000000000005', 'Xfer E closed', '7a000000-0000-0000-0000-000000000008', false, false),
  ('7b000000-0000-0000-0000-000000000006', 'Xfer F optout', '7a000000-0000-0000-0000-000000000009', false, true),
  ('7b000000-0000-0000-0000-000000000007', 'Xfer H sender three', '7a000000-0000-0000-0000-000000000010', false, true),
  ('7b000000-0000-0000-0000-000000000008', 'Xfer L lab', '7a000000-0000-0000-0000-000000000011', true, true);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions)
values
  ('7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000002', 'Member', true, '{inventory}'),
  ('7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000003', 'Member', true, '{}'),
  ('7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000004', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000005', 'Member', true, '{inventory}'),
  ('7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000006', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000004', '7a000000-0000-0000-0000-000000000007', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000005', '7a000000-0000-0000-0000-000000000008', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000006', '7a000000-0000-0000-0000-000000000009', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000007', '7a000000-0000-0000-0000-000000000010', 'Admin', true, '{}'),
  ('7b000000-0000-0000-0000-000000000008', '7a000000-0000-0000-0000-000000000011', 'Admin', true, '{}');

insert into public.species (id, name, organisation_id, ala_guid, indigenous_name)
values
  ('7c000000-0000-0000-0000-000000000001', 'Xfer Acacia testus', '7b000000-0000-0000-0000-000000000001', 'xfer-guid-acacia', 'Wattle test'),
  ('7c000000-0000-0000-0000-000000000002', 'Xfer Banksia testa', '7b000000-0000-0000-0000-000000000001', null, null),
  -- B already has both species: one matches on ala_guid under another name, the
  -- other on a case-insensitive name.
  ('7c000000-0000-0000-0000-000000000003', 'Xfer Acacia local', '7b000000-0000-0000-0000-000000000002', 'xfer-guid-acacia', null),
  ('7c000000-0000-0000-0000-000000000004', 'XFER BANKSIA TESTA', '7b000000-0000-0000-0000-000000000002', null, null),
  ('7c000000-0000-0000-0000-000000000005', 'Xfer D species', '7b000000-0000-0000-0000-000000000004', null, null),
  ('7c000000-0000-0000-0000-000000000006', 'Xfer H species', '7b000000-0000-0000-0000-000000000007', null, null);

-- Points that resolve to an IBRA region (taken from batch_combine.sql).
insert into public.collection (id, species_id, organisation_id, collected_by, collected_on, code, location, created_at)
values
  ('7d000000-0000-0000-0000-000000000001', '7c000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', '2024-05-10', 'XFER-CA1-GEN', '0101000020E6100000508D976E12635E40D50968226CA83FC0'::public.geography, '2024-05-10 00:00:00+00'),
  ('7d000000-0000-0000-0000-000000000002', '7c000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001', '2023-03-01', 'XFER-CA2-GEN', '0101000020E61000006DE7FBA9F1A25D4085EB51B81E1540C0'::public.geography, '2023-03-01 00:00:00+00');

-- The collection code trigger generates its own code; put fixed ones back.
update public.collection set code = 'XFER-CA1' where id = '7d000000-0000-0000-0000-000000000001';
update public.collection set code = 'XFER-CA2' where id = '7d000000-0000-0000-0000-000000000002';

insert into public.storage_locations (id, organisation_id, name, active)
values
  ('79000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'Xfer A shelf 1', true),
  ('79000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000001', 'Xfer A shelf 2', true);

insert into public.containers (id, organisation_id, name, purpose, active)
values
  ('78000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', 'Xfer A box 1', 'storage', true),
  ('78000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000001', 'Xfer A box 2', 'storage', true);

insert into public.batches (id, collection_id, species_id, organisation_id, code, weight_grams)
values
  ('7e000000-0000-0000-0000-000000000001', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-BA1', null),
  ('7e000000-0000-0000-0000-000000000002', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-BA2', null),
  ('7e000000-0000-0000-0000-000000000003', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-MERGE', null),
  ('7e000000-0000-0000-0000-000000000004', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-MERGE', null),
  ('7e000000-0000-0000-0000-000000000005', '7d000000-0000-0000-0000-000000000002', null, '7b000000-0000-0000-0000-000000000001', 'XFER-BA3C', null),
  ('7e000000-0000-0000-0000-000000000006', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-BA4', null),
  ('7e000000-0000-0000-0000-000000000007', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-BA5', null),
  ('7e000000-0000-0000-0000-000000000008', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-BA6', null),
  ('7e000000-0000-0000-0000-000000000009', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-BA8', null),
  ('7e000000-0000-0000-0000-000000000010', '7d000000-0000-0000-0000-000000000001', null, '7b000000-0000-0000-0000-000000000001', 'XFER-BA9', null),
  -- D and H hold collectionless batches that carry their own species and code.
  ('7e000000-0000-0000-0000-000000000011', null, '7c000000-0000-0000-0000-000000000005', '7b000000-0000-0000-0000-000000000004', 'XFER-D-1', null),
  ('7e000000-0000-0000-0000-000000000012', null, '7c000000-0000-0000-0000-000000000005', '7b000000-0000-0000-0000-000000000004', 'XFER-D-2', null),
  ('7e000000-0000-0000-0000-000000000013', null, '7c000000-0000-0000-0000-000000000006', '7b000000-0000-0000-0000-000000000007', 'XFER-H-1', null),
  ('7e000000-0000-0000-0000-000000000014', null, '7c000000-0000-0000-0000-000000000006', '7b000000-0000-0000-0000-000000000007', 'XFER-H-2', null),
  ('7e000000-0000-0000-0000-000000000015', null, '7c000000-0000-0000-0000-000000000006', '7b000000-0000-0000-0000-000000000007', 'XFER-H-3', null),
  ('7e000000-0000-0000-0000-000000000016', null, '7c000000-0000-0000-0000-000000000006', '7b000000-0000-0000-0000-000000000007', 'XFER-H-4', null);

insert into public.batch_custody (batch_id, organisation_id)
select b.id, b.organisation_id
from public.batches b
where b.id in (
  '7e000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000004', '7e000000-0000-0000-0000-000000000005',
  '7e000000-0000-0000-0000-000000000006', '7e000000-0000-0000-0000-000000000007', '7e000000-0000-0000-0000-000000000008', '7e000000-0000-0000-0000-000000000009', '7e000000-0000-0000-0000-000000000010',
  '7e000000-0000-0000-0000-000000000011', '7e000000-0000-0000-0000-000000000012', '7e000000-0000-0000-0000-000000000013', '7e000000-0000-0000-0000-000000000014', '7e000000-0000-0000-0000-000000000015', '7e000000-0000-0000-0000-000000000016'
);

insert into public.sub_batches (id, batch_id, container_id, weight_grams, notes)
values
  ('7f000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', null, 60, 'Immediate whole stored bag'),
  ('7f000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000002', null, 100, 'Immediate split bag'),
  ('7f000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000003', '78000000-0000-0000-0000-000000000001', 40, 'Pending stored bag'),
  ('7f000000-0000-0000-0000-000000000004', '7e000000-0000-0000-0000-000000000003', null, 50, 'Pending unstored bag'),
  ('7f000000-0000-0000-0000-000000000005', '7e000000-0000-0000-0000-000000000004', null, 10, 'Merge partner batch bag'),
  ('7f000000-0000-0000-0000-000000000006', '7e000000-0000-0000-0000-000000000005', null, 120, 'Pending split portion source'),
  ('7f000000-0000-0000-0000-000000000007', '7e000000-0000-0000-0000-000000000006', null, 30, 'Cancelled pending bag'),
  ('7f000000-0000-0000-0000-000000000008', '7e000000-0000-0000-0000-000000000007', null, 25, 'Bag sent for testing'),
  ('7f000000-0000-0000-0000-000000000009', '7e000000-0000-0000-0000-000000000008', null, 15, 'Rejection probe bag'),
  ('7f000000-0000-0000-0000-000000000010', '7e000000-0000-0000-0000-000000000009', null, 20, 'Opt-out restore bag'),
  ('7f000000-0000-0000-0000-000000000011', '7e000000-0000-0000-0000-000000000010', null, 11, 'Immediate after link bag'),
  ('7f000000-0000-0000-0000-000000000012', '7e000000-0000-0000-0000-000000000011', null, 22, 'D decline bag'),
  ('7f000000-0000-0000-0000-000000000013', '7e000000-0000-0000-0000-000000000012', null, 24, 'D opt-out bag'),
  ('7f000000-0000-0000-0000-000000000014', '7e000000-0000-0000-0000-000000000013', null, 12, 'H opt-out bag'),
  ('7f000000-0000-0000-0000-000000000015', '7e000000-0000-0000-0000-000000000014', null, 12, 'H revalidation bag'),
  ('7f000000-0000-0000-0000-000000000016', '7e000000-0000-0000-0000-000000000015', null, 12, 'H to lab bag'),
  ('7f000000-0000-0000-0000-000000000017', '7e000000-0000-0000-0000-000000000016', null, 9, 'H testing probe bag');

insert into public.batch_storage (id, batch_id, sub_batch_id, location_id, stored_at, notes)
values
  ('77000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', '2026-01-01 00:00:00+00', 'W1 shelf'),
  ('77000000-0000-0000-0000-000000000002', '7e000000-0000-0000-0000-000000000003', '7f000000-0000-0000-0000-000000000003', '79000000-0000-0000-0000-000000000001', '2026-01-01 00:00:00+00', 'WS shelf'),
  ('77000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000006', '7f000000-0000-0000-0000-000000000007', '79000000-0000-0000-0000-000000000001', '2026-01-01 00:00:00+00', 'WX shelf');

-- One quality test on W1's batch, so the first transfer has something to capture.
insert into public.tests (id, batch_id, sub_batch_id, type, result, tested_at, performed_by_organisation_id)
values (
  '75000000-0000-0000-0000-000000000001', '7e000000-0000-0000-0000-000000000001', '7f000000-0000-0000-0000-000000000001', 'quality',
  '{"test_type":"x-ray","psu_grams":10,"repeats":[{"weight_grams":1,"viable_seed_count":8,"dead_seed_count":2}],"notes":"private note"}'::jsonb,
  '2026-02-01 00:00:00+00', '7b000000-0000-0000-0000-000000000001'
);

-- A holds a testing link to L, and accepted transfer links to C and F (what a
-- first accepted request leaves behind).
insert into public.organisation_link (requesting_org_id, provider_org_id, created_by)
values ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000008', '7a000000-0000-0000-0000-000000000001');

insert into public.organisation_link (requesting_org_id, provider_org_id, created_by, kind)
values
  ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000001', 'transfer'),
  ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000006', '7a000000-0000-0000-0000-000000000001', 'transfer');

-- A legacy pending testing request, used by the isolation checks.
insert into public.organisation_link_request (id, requesting_org_id, provider_org_id, created_by)
values ('74000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000008', '7a000000-0000-0000-0000-000000000001');

create temporary table xfer (key text primary key, result jsonb);
create temporary table lr (key text primary key, id uuid);
grant all on xfer, lr to authenticated;

-- ===========================================================================
-- 1. Catalogue: grants, helpers, RLS
-- ===========================================================================

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'fn_complete_ownership_transfer',
        'fn_close_storage_for_transfer',
        'fn_transfer_resolve_caller',
        'fn_transfer_lock_pair',
        'fn_transfer_bag_problem',
        'fn_transfer_source_facts',
        'fn_transfer_send_result',
        'fn_transfer_authorise_received_batch',
        'fn_transfer_numeric_or_null',
        'fn_transfer_quality_test_type',
        'fn_transfer_project_statistics',
        'fn_transfer_project_result',
        'fn_lock_batch_bags_for_consumption',
        'guard_reserved_bag_insert',
        'guard_reserved_bag_update',
        'guard_reserved_sub_batch_change',
        'guard_reserved_sub_batch_delete',
        'guard_reserved_merge_source'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'internal transfer helpers are not executable by PUBLIC, anon or authenticated'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'fn_transfer_directory',
        'fn_send_bags_for_transfer',
        'fn_respond_transfer_link_request',
        'fn_cancel_ownership_transfer',
        'fn_set_accepts_transfers',
        'fn_received_batch_provenance',
        'fn_received_batch_storage_history',
        'fn_list_transfer_link_requests',
        'fn_sub_batch_reservations',
        'fn_received_batch_sources',
        'fn_update_batch_storage_record'
      )
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  $$,
  array[11],
  'authenticated can execute the public transfer RPCs and the storage RPC'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'fn_transfer_directory',
        'fn_send_bags_for_transfer',
        'fn_respond_transfer_link_request',
        'fn_cancel_ownership_transfer',
        'fn_set_accepts_transfers',
        'fn_received_batch_provenance',
        'fn_received_batch_storage_history',
        'fn_list_transfer_link_requests',
        'fn_sub_batch_reservations',
        'fn_received_batch_sources',
        'fn_update_batch_storage_record'
      )
      and grantee in ('PUBLIC', 'anon')
      and privilege_type = 'EXECUTE'
  $$,
  array[0],
  'PUBLIC and anon cannot execute the public transfer RPCs'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'ownership_transfer',
        'ownership_transfer_item',
        'sub_batch_reservation',
        'ownership_transfer_test_snapshot',
        'ownership_transfer_storage_snapshot'
      )
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  $$,
  array[0],
  'clients have no write grants on any transfer table'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in (
        'ownership_transfer',
        'ownership_transfer_item',
        'sub_batch_reservation',
        'ownership_transfer_test_snapshot',
        'ownership_transfer_storage_snapshot'
      )
      and relrowsecurity
  $$,
  array[5],
  'row level security is enabled on every transfer table'
);

select ok(
  not has_column_privilege('authenticated', 'public.ownership_transfer', 'request_fingerprint', 'SELECT'),
  'the replay fingerprint is not readable by clients'
);

select ok(
  not has_table_privilege('authenticated', 'public.batch_storage', 'UPDATE')
    and not has_table_privilege('anon', 'public.batch_storage', 'UPDATE'),
  'clients hold no UPDATE privilege on batch_storage'
);

select results_eq(
  $$
    select e.enumlabel::text
    from pg_enum e
    inner join pg_type t on t.oid = e.enumtypid
    where t.typname = 'organisation_link_kind'
    order by e.enumsortorder
  $$,
  array['testing', 'transfer'],
  'links come in testing and transfer kinds'
);

-- ===========================================================================
-- 2. Settings guard and the opt-in RPC
-- ===========================================================================

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_complete_ownership_transfer('73000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'the completion step cannot be called directly by a signed-in user'
);

select throws_ok(
  $$ select public.fn_close_storage_for_transfer('7f000000-0000-0000-0000-000000000001', now(), 'probe') $$,
  '42501',
  null,
  'the storage closing step cannot be called directly by a signed-in user'
);

select throws_ok(
  $$ update public.organisation set accepts_transfers = true where id = '7b000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'an Admin cannot change accepts_transfers with a direct update'
);

select lives_ok(
  $$ update public.organisation set name = 'Xfer A sender (edited)' where id = '7b000000-0000-0000-0000-000000000001' $$,
  'an Admin can still edit other organisation fields'
);

select is(
  (select name from public.organisation where id = '7b000000-0000-0000-0000-000000000001'),
  'Xfer A sender (edited)',
  'the other organisation edit took effect'
);

select is(
  (select accepts_transfers from public.organisation where id = '7b000000-0000-0000-0000-000000000001'),
  false,
  'the rejected update left accepts_transfers unchanged'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Member","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_set_accepts_transfers(true) $$,
  '42501',
  null,
  'a Member cannot change the incoming transfer setting'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000008","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000005","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select public.fn_set_accepts_transfers(true) ->> 'changed'),
  'true',
  'an Admin opts in through the RPC'
);

select is(
  (select accepts_transfers from public.organisation where id = '7b000000-0000-0000-0000-000000000005'),
  true,
  'the RPC sets the flag'
);

select is(
  (select public.fn_set_accepts_transfers(true) ->> 'changed'),
  'false',
  'opting in twice changes nothing'
);

select is(
  (select public.fn_set_accepts_transfers(false) ->> 'changed'),
  'true',
  'an Admin opts out again'
);

-- ===========================================================================
-- 3. Directory
-- ===========================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    select name, is_linked, has_pending_request
    from public.fn_transfer_directory()
  $$,
  $$
    values
      ('Xfer B recipient'::text, false, false),
      ('Xfer C linked'::text, true, false),
      ('Xfer D sender two'::text, false, false),
      ('Xfer F optout'::text, true, false),
      ('Xfer H sender three'::text, false, false),
      ('Xfer L lab'::text, false, false)
  $$,
  'the directory lists opted-in organisations with link state, not the caller or closed organisations'
);

select is(
  (select count(*) from public.fn_transfer_directory() where name in ('Xfer A sender (edited)', 'Xfer E closed')),
  0::bigint,
  'the directory leaves out the caller and an organisation that has not opted in'
);

-- ===========================================================================
-- 4. Link isolation
-- ===========================================================================

select throws_ok(
  $$
    insert into public.organisation_link (requesting_org_id, provider_org_id, created_by, kind)
    values ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000001', 'transfer')
  $$,
  '42501',
  null,
  'a sender Admin cannot insert a transfer link'
);

select throws_ok(
  $$
    update public.organisation_link
    set kind = 'transfer'
    where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000008'
  $$,
  '42501',
  null,
  'a testing link cannot be turned into a transfer link'
);

select throws_ok(
  $$
    update public.organisation_link
    set kind = 'transfer', provider_org_id = '7b000000-0000-0000-0000-000000000002'
    where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000008'
  $$,
  '42501',
  null,
  'a testing link cannot be re-pointed at another provider as a transfer link'
);

select throws_ok(
  $$
    update public.organisation_link
    set requesting_org_id = '7b000000-0000-0000-0000-000000000002'
    where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000008'
  $$,
  '42501',
  null,
  'a testing link cannot be handed to another requester'
);

select throws_ok(
  $$
    insert into public.organisation_link_request (requesting_org_id, provider_org_id, created_by, kind)
    values ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000001', 'transfer')
  $$,
  '42501',
  null,
  'a sender Admin cannot insert a transfer link request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    insert into public.organisation_link (requesting_org_id, provider_org_id, created_by, kind)
    values ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000004', 'transfer')
  $$,
  '42501',
  null,
  'a recipient Admin cannot mint a transfer link directly either'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000011","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000008","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ update public.organisation_link_request set kind = 'transfer' where id = '74000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'a pending testing request cannot be turned into a transfer request'
);

reset role;
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$
    insert into public.organisation_link_request (id, requesting_org_id, provider_org_id, created_by)
    values ('74000000-0000-0000-0000-000000000002', '7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000008', '7a000000-0000-0000-0000-000000000001')
  $$,
  'the transfer-only unique index allows duplicate pending testing requests'
);

select is(
  (
    select count(id)
    from public.organisation_link_request
    where requesting_org_id = '7b000000-0000-0000-0000-000000000001'
      and provider_org_id = '7b000000-0000-0000-0000-000000000008'
      and kind = 'testing'
      and accepted_at is null
  ),
  2::bigint,
  'both pending testing requests exist'
);

select lives_ok(
  $$
    insert into public.organisation_link_request (id, requesting_org_id, provider_org_id, created_by, kind)
    values ('74000000-0000-0000-0000-000000000003', '7b000000-0000-0000-0000-000000000005', '7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000008', 'transfer')
  $$,
  'one open transfer request per directional pair is allowed'
);

select throws_ok(
  $$
    insert into public.organisation_link_request (id, requesting_org_id, provider_org_id, created_by, kind)
    values ('74000000-0000-0000-0000-000000000004', '7b000000-0000-0000-0000-000000000005', '7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000008', 'transfer')
  $$,
  '23505',
  null,
  'a second open transfer request for the same pair is rejected'
);

select lives_ok(
  $$ update public.organisation_link_request set cancelled_at = now() where id = '74000000-0000-0000-0000-000000000003' $$,
  'an open transfer request can be cancelled'
);

select lives_ok(
  $$
    insert into public.organisation_link_request (id, requesting_org_id, provider_org_id, created_by, kind)
    values ('74000000-0000-0000-0000-000000000005', '7b000000-0000-0000-0000-000000000005', '7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000008', 'transfer')
  $$,
  'a cancelled request no longer counts as open'
);

select throws_ok(
  $$
    insert into public.organisation_link_request
      (id, requesting_org_id, provider_org_id, created_by, kind, accepted_at, declined_at)
    values ('74000000-0000-0000-0000-000000000006', '7b000000-0000-0000-0000-000000000006', '7b000000-0000-0000-0000-000000000003', '7a000000-0000-0000-0000-000000000009', 'transfer', now(), now())
  $$,
  '23514',
  null,
  'a request cannot be both accepted and declined'
);

-- ===========================================================================
-- 5. Rejections (nothing may be written)
-- ===========================================================================

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000005', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000009"}]'::jsonb, null, '76000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  null,
  'a recipient that has not opted in is rejected'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000009', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000009"}]'::jsonb, null, '76000000-0000-0000-0000-000000000002'
    )
  $$,
  'P0002',
  null,
  'an unknown recipient is rejected'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000001', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000009"}]'::jsonb, null, '76000000-0000-0000-0000-000000000003'
    )
  $$,
  '22023',
  null,
  'a transfer to the caller''s own organisation is rejected'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000009"}]'::jsonb, null, null::uuid
    )
  $$,
  '22023',
  null,
  'a send without a request id is rejected'
);

select throws_ok(
  $$ select public.fn_send_bags_for_transfer('7b000000-0000-0000-0000-000000000003', '[]'::jsonb, null, '76000000-0000-0000-0000-000000000004') $$,
  '22023',
  null,
  'a send without bags is rejected'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003',
      '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000009"},{"sub_batch_id":"7f000000-0000-0000-0000-000000000009"}]'::jsonb,
      null,
      '76000000-0000-0000-0000-000000000005'
    )
  $$,
  '22023',
  null,
  'a bag may appear once per request'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000009","sample_weight_grams":15}]'::jsonb, null, '76000000-0000-0000-0000-000000000006'
    )
  $$,
  '22023',
  null,
  'a portion must weigh less than the bag'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000018"}]'::jsonb, null, '76000000-0000-0000-0000-000000000007'
    )
  $$,
  'P0002',
  null,
  'an unknown bag is rejected'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000012"}]'::jsonb, null, '76000000-0000-0000-0000-000000000008'
    )
  $$,
  '42501',
  null,
  'a bag the caller does not hold is rejected'
);

select lives_ok(
  $$
    select * from public.fn_assign_bags_for_testing(
      '7b000000-0000-0000-0000-000000000008', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000008"}]'::jsonb
    )
  $$,
  'testing assignment to a linked provider still works'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000008"}]'::jsonb, null, '76000000-0000-0000-0000-000000000009'
    )
  $$,
  '55000',
  null,
  'a bag out for testing cannot be transferred'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Member","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000009"}]'::jsonb, null, '76000000-0000-0000-0000-000000000010'
    )
  $$,
  '42501',
  null,
  'a Member without the inventory permission cannot send'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(id) from public.ownership_transfer),
  0::bigint,
  'rejected sends left no transfer behind'
);

select is(
  (select count(*) from public.sub_batch_reservation),
  0::bigint,
  'rejected sends reserved nothing'
);

select is(
  (select count(id) from public.organisation_link_request where kind = 'transfer' and requesting_org_id = '7b000000-0000-0000-0000-000000000001'),
  0::bigint,
  'rejected sends opened no link request'
);

select is(
  (select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000009'),
  15::numeric,
  'a rejected send did not change the bag weight'
);

-- ===========================================================================
-- 6. Immediate transfers (accepted link A to C)
-- ===========================================================================

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'T1', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000001"}]'::jsonb, 'first gift', '76000000-0000-0000-0000-000000000011'
    )
  $$,
  'an Admin sends a whole stored bag to a linked recipient'
);

select is(
  (select result -> 'transfer' ->> 'status' from xfer where key = 'T1'),
  'completed',
  'a send over an accepted link completes at once'
);

select is(
  (select (result ->> 'link_request_created')::boolean from xfer where key = 'T1'),
  false,
  'no link request is created when a link exists'
);

select is(
  (select (result ->> 'replayed')::boolean from xfer where key = 'T1'),
  false,
  'a first send is not a replay'
);

select results_eq(
  $$
    select result -> 'items' -> 0 ->> 'species_name', result -> 'items' -> 0 ->> 'collection_code'
    from xfer where key = 'T1'
  $$,
  $$ values ('Xfer Acacia testus'::text, 'XFER-CA1'::text) $$,
  'the result names the species and the collection code'
);

reset role;
select set_config('request.jwt.claims', '', true);

create temporary table rx1 as
select
  oti.id as item_id,
  oti.sub_batch_id as src_bag,
  oti.seed_transfer_item_id as sti_id,
  oti.received_batch_id as batch_id,
  oti.received_sub_batch_id as bag_id,
  oti.weight_grams
from public.ownership_transfer_item oti
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'T1');

select is((select count(*) from rx1), 1::bigint, 'the transfer has one item');

select results_eq(
  $$
    select status, link_request_id is null, transfer_event_id is not null, request_id
    from public.ownership_transfer
    where id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'T1')
  $$,
  $$ values ('completed'::text, true, true, '76000000-0000-0000-0000-000000000011'::uuid) $$,
  'the transfer row is completed with its event and request id'
);

select is(
  (select organisation_id from public.batches where id = (select batch_id from rx1)),
  '7b000000-0000-0000-0000-000000000003'::uuid,
  'the new batch belongs to the recipient'
);

select ok(
  (select collection_id is null from public.batches where id = (select batch_id from rx1)),
  'the new batch has no collection'
);

select results_eq(
  $$
    select code, source_collection_code, source_collection_year
    from public.batches where id = (select batch_id from rx1)
  $$,
  $$ values ('XFER-CA1'::text, 'XFER-CA1'::text, 2024::smallint) $$,
  'the new batch shows the source collection code and year'
);

select is(
  (select source_ibra_code from public.batches where id = (select batch_id from rx1)),
  public.get_ibra_code_from_location((select location from public.collection where id = '7d000000-0000-0000-0000-000000000001')),
  'the new batch carries the source IBRA code'
);

select isnt(
  (select source_ibra_code from public.batches where id = (select batch_id from rx1)),
  'UNK',
  'the fixture point resolves to a real IBRA region'
);

select is(
  (select received_transfer_item_id from public.batches where id = (select batch_id from rx1)),
  (select sti_id from rx1),
  'the new batch points at the ledger item'
);

select results_eq(
  $$
    select s.organisation_id, s.name, s.ala_guid, s.indigenous_name
    from public.species s
    inner join public.batches b on b.species_id = s.id
    where b.id = (select batch_id from rx1)
  $$,
  $$ values ('7b000000-0000-0000-0000-000000000003'::uuid, 'Xfer Acacia testus'::text, 'xfer-guid-acacia'::text, 'Wattle test'::text) $$,
  'a missing recipient species is created with the source name, guid and indigenous name'
);

select results_eq(
  $$
    select weight_grams, held_by_org_id, container_id is null
    from public.sub_batches where id = (select bag_id from rx1)
  $$,
  $$ values (60::numeric, '7b000000-0000-0000-0000-000000000003'::uuid, true) $$,
  'the received bag carries the moved weight and is held by the recipient'
);

select results_eq(
  $$
    select organisation_id, previous_organisation_id
    from public.batch_custody where batch_id = (select batch_id from rx1)
  $$,
  $$ values ('7b000000-0000-0000-0000-000000000003'::uuid, '7b000000-0000-0000-0000-000000000001'::uuid) $$,
  'custody of the new batch starts with the recipient'
);

select is(
  (
    select count(*)
    from public.sub_batch_lineage
    where operation_kind = 'transfer'
      and source_sub_batch_id = '7f000000-0000-0000-0000-000000000001'
      and derived_sub_batch_id = (select bag_id from rx1)
      and operation_id = (select sti_id from rx1)
  ),
  1::bigint,
  'a transfer lineage edge links the source bag to the received bag'
);

select is((select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000001'), 0::numeric, 'the source bag dropped to zero');

select is(
  (
    select count(*)
    from public.batch_weight_adjustments
    where sub_batch_id = '7f000000-0000-0000-0000-000000000001'
      and kind = 'transfer_out'
      and transfer_item_id = (select sti_id from rx1)
      and weight_grams = -60
  ),
  1::bigint,
  'a single transfer_out adjustment took exactly the moved weight'
);

select results_eq(
  $$
    select owner_org_id, weight_grams from public.seed_transfer_item
    where id = (select sti_id from rx1)
  $$,
  $$ values ('7b000000-0000-0000-0000-000000000001'::uuid, 60::numeric) $$,
  'the ledger item records the sender as owner and the moved weight'
);

select ok(
  exists (
    select 1
    from public.seed_transfer_event e
    inner join public.ownership_transfer ot on ot.transfer_event_id = e.id
    where ot.id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'T1')
      and e.kind = 'ownership_transfer'
      and e.sender_org_id = '7b000000-0000-0000-0000-000000000001'
      and e.recipient_org_id = '7b000000-0000-0000-0000-000000000003'
  ),
  'an ownership_transfer ledger event runs from sender to recipient'
);

select ok(
  exists (
    select 1 from public.batch_storage
    where sub_batch_id = '7f000000-0000-0000-0000-000000000001'
      and moved_out_at is not null
      and notes = 'Transferred to Xfer C linked'
  )
  and not exists (
    select 1 from public.batch_storage
    where sub_batch_id = '7f000000-0000-0000-0000-000000000001' and moved_out_at is null
  ),
  'completion closed the stored bag''s storage'
);

select results_eq(
  $$
    select hop, type, quality_test_type, tested_at, performed_by_organisation_id
    from public.ownership_transfer_test_snapshot
    where ownership_transfer_item_id = (select item_id from rx1)
  $$,
  $$ values (0, 'quality'::text, 'x-ray'::text, '2026-02-01 00:00:00+00'::timestamptz, '7b000000-0000-0000-0000-000000000001'::uuid) $$,
  'the latest test was captured with its date and performing organisation'
);

select ok(
  (
    select not jsonb_exists(result, 'notes')
    from public.ownership_transfer_test_snapshot
    where ownership_transfer_item_id = (select item_id from rx1)
  ),
  'the captured result has no free-text notes'
);

select is(
  (select count(*) from public.ownership_transfer_storage_snapshot where ownership_transfer_item_id = (select item_id from rx1)),
  1::bigint,
  'the stored bag''s storage period was captured'
);

-- A member with the inventory permission sends a weighed portion.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Member","permissions":["inventory"]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'T2', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000002","sample_weight_grams":30}]'::jsonb, 'portion', '76000000-0000-0000-0000-000000000012'
    )
  $$,
  'a Member with the inventory permission sends a portion of a bag'
);

select is(
  (select result -> 'transfer' ->> 'status' from xfer where key = 'T2'),
  'completed',
  'the portion transfer completes'
);

reset role;
select set_config('request.jwt.claims', '', true);

create temporary table rx2 as
select
  oti.id as item_id,
  oti.sub_batch_id as src_bag,
  oti.seed_transfer_item_id as sti_id,
  oti.received_batch_id as batch_id,
  oti.received_sub_batch_id as bag_id,
  oti.weight_grams
from public.ownership_transfer_item oti
where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'T2');

select is((select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000002'), 70::numeric, 'the source bag keeps what was not sent');

select is(
  (select weight_grams from public.sub_batches where id = (select bag_id from rx2)),
  30::numeric,
  'the recipient bag holds exactly the weight that left the source'
);

select ok(
  (select src_bag <> '7f000000-0000-0000-0000-000000000002'::uuid from rx2)
  and (select batch_id <> '7e000000-0000-0000-0000-000000000002'::uuid from rx2),
  'the moved bag is the split child and the received batch is new'
);

select is(
  (select sb.batch_id from public.sub_batches sb where sb.id = (select src_bag from rx2)),
  '7e000000-0000-0000-0000-000000000002'::uuid,
  'the split child sits in the source batch'
);

select is(
  (
    select count(*) from public.sub_batch_lineage
    where operation_kind = 'split' and source_sub_batch_id = '7f000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'exactly one split was made'
);

select is(
  (
    select count(*) from public.sub_batch_lineage
    where operation_kind = 'transfer'
      and source_sub_batch_id = (select src_bag from rx2)
      and derived_sub_batch_id = (select bag_id from rx2)
  ),
  1::bigint,
  'the split child has its transfer edge'
);

select is(
  (select current_weight from public.sub_batch_current_weight where id = (select src_bag from rx2)),
  0::numeric,
  'the split child dropped to zero'
);

-- Replay.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Member","permissions":["inventory"]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'T2R', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000002","sample_weight_grams":30}]'::jsonb, 'portion', '76000000-0000-0000-0000-000000000012'
    )
  $$,
  'the same request id and payload can be sent again'
);

select is(
  (select (result ->> 'replayed')::boolean from xfer where key = 'T2R'),
  true,
  'the second call is a replay'
);

select is(
  (select result -> 'transfer' ->> 'id' from xfer where key = 'T2R'),
  (select result -> 'transfer' ->> 'id' from xfer where key = 'T2'),
  'a replay returns the original transfer'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(id) from public.ownership_transfer where request_id = '76000000-0000-0000-0000-000000000012'),
  1::bigint,
  'a replay creates no second transfer'
);

select is((select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000002'), 70::numeric, 'a replay leaves 70 g on the 100 g source');

select is(
  (
    select count(*) from public.sub_batch_lineage
    where operation_kind = 'split' and source_sub_batch_id = '7f000000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'a replay makes no second split'
);

select is(
  (select count(*) from public.batches where organisation_id = '7b000000-0000-0000-0000-000000000003' and received_transfer_item_id is not null),
  2::bigint,
  'the recipient holds one received batch per completed transfer'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Member","permissions":["inventory"]}}',
  true
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000002","sample_weight_grams":50}]'::jsonb, 'portion', '76000000-0000-0000-0000-000000000012'
    )
  $$,
  '22023',
  null,
  'reusing a request id with a different quantity is rejected'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000006', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000002","sample_weight_grams":30}]'::jsonb, 'portion', '76000000-0000-0000-0000-000000000012'
    )
  $$,
  '22023',
  null,
  'reusing a request id for another recipient is rejected'
);

select is(
  (
    select (public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000001"}]'::jsonb, 'first gift', '76000000-0000-0000-0000-000000000011'
    ) ->> 'replayed')::boolean
  ),
  true,
  'a replay is answered even though the bag has since moved'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000001"}]'::jsonb, 'again', '76000000-0000-0000-0000-000000000013'
    )
  $$,
  '22023',
  null,
  'a bag with no seed left cannot be sent again under a new request id'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select count(id) from public.ownership_transfer),
  2::bigint,
  'the sender sees its own transfers'
);

select throws_ok(
  $$ select request_fingerprint from public.ownership_transfer $$,
  '42501',
  null,
  'the replay fingerprint cannot be read by clients'
);

select throws_ok(
  $$
    insert into public.ownership_transfer (sender_org_id, recipient_org_id, request_id, request_fingerprint, created_by)
    values ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000003', '76000000-0000-0000-0000-000000000014', '{}'::jsonb, '7a000000-0000-0000-0000-000000000001')
  $$,
  '42501',
  null,
  'clients cannot write transfers directly'
);

select throws_ok(
  $$ select count(*) from public.sub_batch_reservation $$,
  '42501',
  null,
  'clients cannot read the reservation table directly'
);

-- ===========================================================================
-- 7. Pending transfers to B (no link yet)
-- ===========================================================================

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TA', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002',
      '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000003"},{"sub_batch_id":"7f000000-0000-0000-0000-000000000004"},{"sub_batch_id":"7f000000-0000-0000-0000-000000000006","sample_weight_grams":20}]'::jsonb,
      'pending batch',
      '76000000-0000-0000-0000-000000000015'
    )
  $$,
  'a first send to an unlinked recipient succeeds'
);

select is(
  (select result -> 'transfer' ->> 'status' from xfer where key = 'TA'),
  'pending_link',
  'the transfer waits for the recipient'
);

select is(
  (select (result ->> 'link_request_created')::boolean from xfer where key = 'TA'),
  true,
  'a link request was created'
);

select is(
  (select jsonb_array_length(result -> 'items') from xfer where key = 'TA'),
  3,
  'the transfer lists three bags'
);

reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pa as
select oti.* from public.ownership_transfer_item oti where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TA');

insert into lr (key, id)
select 'AB', r.id
from public.organisation_link_request r
where r.requesting_org_id = '7b000000-0000-0000-0000-000000000001' and r.provider_org_id = '7b000000-0000-0000-0000-000000000002' and r.kind = 'transfer';

select is(
  (select count(*) from public.sub_batch_reservation where transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TA')),
  3::bigint,
  'each bag is reserved'
);

select is(
  (select count(*) from public.sub_batch_reservation),
  3::bigint,
  'nothing else is reserved'
);

select is(
  (select count(*) from public.organisation_link_request where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000002' and kind = 'transfer' and accepted_at is null and declined_at is null and cancelled_at is null),
  1::bigint,
  'one open transfer request exists for the pair'
);

select is(
  (select link_request_id from public.ownership_transfer where id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TA')),
  (select id from lr where key = 'AB'),
  'the transfer is attached to that request'
);

select is(
  (select count(*) from public.batches where organisation_id = '7b000000-0000-0000-0000-000000000002'),
  0::bigint,
  'the recipient has no new batch until it accepts'
);

select ok(
  (select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000003') = 40 and (select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000004') = 50 and (select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000006') = 100
  and (select current_weight from public.sub_batch_current_weight where id = (select sub_batch_id from pa where weight_grams = 20)) = 20,
  'pending bags keep their weight; the split-off portion is its own reserved bag'
);

-- What a reserved bag refuses.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_split_sub_batch('7f000000-0000-0000-0000-000000000003', '[{"weight_grams":5}]'::jsonb) $$,
  '55000',
  null,
  'a reserved bag cannot be split'
);

select throws_ok(
  $$ select public.fn_merge_sub_batches(array['7f000000-0000-0000-0000-000000000003', '7f000000-0000-0000-0000-000000000004']::uuid[], null, null) $$,
  '55000',
  null,
  'reserved bags cannot be merged'
);

select throws_ok(
  $$
    select public.fn_clean_sub_batch(
      '7f000000-0000-0000-0000-000000000003', interval '1 hour', 'seed', null, null, true, null, '{}'::uuid[],
      '[{"quality":"HQ","material_type":"seed","weight_grams":5}]'::jsonb
    )
  $$,
  '55000',
  null,
  'a reserved bag cannot be cleaned'
);

select throws_ok(
  $$
    select public.fn_create_quality_test(
      '7e000000-0000-0000-0000-000000000003', '7f000000-0000-0000-0000-000000000003',
      '{"test_type":"x-ray","psu_grams":1,"repeats":[{"weight_grams":1,"viable_seed_count":5,"dead_seed_count":1}]}'::jsonb,
      '7b000000-0000-0000-0000-000000000001'
    )
  $$,
  '55000',
  null,
  'a reserved bag cannot be tested'
);

select throws_ok(
  $$
    insert into public.tests (batch_id, sub_batch_id, type, result, performed_by_organisation_id)
    values ('7e000000-0000-0000-0000-000000000003', '7f000000-0000-0000-0000-000000000003', 'quality', '{"repeats":[]}'::jsonb, '7b000000-0000-0000-0000-000000000001')
  $$,
  '55000',
  null,
  'a test cannot be written directly against a reserved bag'
);

select throws_ok(
  $$
    select * from public.fn_assign_bags_for_testing('7b000000-0000-0000-0000-000000000008', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000003"}]'::jsonb)
  $$,
  '55000',
  null,
  'a reserved bag cannot be sent for testing'
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000003', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000003"}]'::jsonb, null, '76000000-0000-0000-0000-000000000016'
    )
  $$,
  '55000',
  null,
  'a reserved bag cannot be put in a second transfer'
);

select throws_ok(
  $$ select public.fn_set_sub_batch_storage('7f000000-0000-0000-0000-000000000003', '79000000-0000-0000-0000-000000000002') $$,
  '55000',
  null,
  'a reserved stored bag cannot be moved'
);

select throws_ok(
  $$ select public.fn_set_sub_batch_storage('7f000000-0000-0000-0000-000000000004', '79000000-0000-0000-0000-000000000001') $$,
  '55000',
  null,
  'a reserved unstored bag cannot be stored'
);

select throws_ok(
  $$ select public.fn_update_batch_storage_record('77000000-0000-0000-0000-000000000002', null, 'edited while reserved') $$,
  '55000',
  null,
  'a reserved bag''s storage record cannot be edited through the RPC'
);

select throws_ok(
  $$ update public.batch_storage set notes = 'direct edit' where id = '77000000-0000-0000-0000-000000000002' $$,
  '42501',
  null,
  'a direct client update of batch_storage is denied'
);

select throws_ok(
  $$ update public.sub_batches set container_id = '78000000-0000-0000-0000-000000000002' where id = '7f000000-0000-0000-0000-000000000003' $$,
  '55000',
  null,
  'a reserved bag cannot change container'
);

select throws_ok(
  $$
    insert into public.batch_weight_adjustments (sub_batch_id, weight_grams, reason, created_by)
    values ('7f000000-0000-0000-0000-000000000003', -1, 'probe', '7a000000-0000-0000-0000-000000000001')
  $$,
  '55000',
  null,
  'a reserved bag cannot be adjusted'
);

select throws_ok(
  $$ select public.fn_merge_batches(array['7e000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000004']::uuid[]) $$,
  '55000',
  null,
  'a whole-batch merge refuses a batch with a reserved bag'
);

select throws_ok(
  $$ select public.fn_mix_batches(array['7e000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000004']::uuid[]) $$,
  '55000',
  null,
  'a whole-batch mix refuses a batch with a reserved bag'
);

select throws_ok(
  $$ select public.fn_split_batch('7e000000-0000-0000-0000-000000000003', 5) $$,
  '55000',
  null,
  'a batch-level split refuses a batch with a reserved bag'
);

reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$ delete from public.sub_batches where id = '7f000000-0000-0000-0000-000000000004' $$,
  '55000',
  null,
  'a reserved bag cannot be deleted'
);

select is(
  (select count(*) from public.sub_batches where batch_id = '7e000000-0000-0000-0000-000000000003'),
  2::bigint,
  'the refused writes changed nothing'
);

-- Reads while pending.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$ select count(*)::integer, min(recipient_org_name) from public.fn_sub_batch_reservations() $$,
  $$ values (3, 'Xfer B recipient'::text) $$,
  'the sender sees which bags are reserved and for whom'
);

select is(
  (select jsonb_array_length(public.fn_list_transfer_link_requests() -> 'outgoing_transfers')),
  1,
  'the sender lists its pending outgoing transfer'
);

select is(
  (select has_pending_request from public.fn_transfer_directory() where name = 'Xfer B recipient'),
  true,
  'the directory shows the pending request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select results_eq(
  $$
    select
      (res -> 'incoming_request_count')::text,
      jsonb_array_length(res -> 'incoming_requests' -> 0 -> 'bags')::text
    from (select public.fn_list_transfer_link_requests() as res) q
  $$,
  $$ values ('1'::text, '3'::text) $$,
  'the recipient Admin lists the incoming request with its three bags'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Member","permissions":["inventory"]}}',
  true
);

select is(
  (select jsonb_array_length(public.fn_list_transfer_link_requests() -> 'incoming_requests')),
  0,
  'a recipient Member does not see incoming requests'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    update public.organisation_link_request
    set accepted_at = now(), accepted_by = '7a000000-0000-0000-0000-000000000004'
    where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000002' and kind = 'transfer'
  $$,
  'a direct update of a transfer request affects nothing'
);

reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select accepted_at is null from public.organisation_link_request where id = (select id from lr where key = 'AB')),
  'a transfer request cannot be accepted outside the RPC'
);

-- A second send to the same recipient joins the open request.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TB', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000007"}]'::jsonb, 'second', '76000000-0000-0000-0000-000000000017'
    )
  $$,
  'a second send to the same recipient succeeds'
);

select is(
  (select (result ->> 'link_request_created')::boolean from xfer where key = 'TB'),
  false,
  'it reuses the open link request'
);

select is(
  (select result -> 'transfer' ->> 'link_request_id' from xfer where key = 'TB'),
  (select id::text from lr where key = 'AB'),
  'it is attached to the same request'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*) from public.organisation_link_request where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000002' and kind = 'transfer' and accepted_at is null and declined_at is null and cancelled_at is null),
  1::bigint,
  'there is still only one open request for the pair'
);

-- Cancel.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_cancel_ownership_transfer((select (result->'transfer'->>'id')::uuid from xfer where key = 'TB')) $$,
  '42501',
  null,
  'only the sender can cancel a transfer'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Member","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_cancel_ownership_transfer((select (result->'transfer'->>'id')::uuid from xfer where key = 'TB')) $$,
  '42501',
  null,
  'cancelling needs the inventory permission'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TBC', public.fn_cancel_ownership_transfer((select (result->'transfer'->>'id')::uuid from xfer where key = 'TB'))
  $$,
  'the sender cancels its second transfer'
);

select results_eq(
  $$
    select result ->> 'status', result ->> 'link_request_cancelled', result ->> 'already_cancelled'
    from xfer where key = 'TBC'
  $$,
  $$ values ('cancelled'::text, 'false'::text, 'false'::text) $$,
  'the request stays open while another transfer still waits on it'
);

select is(
  (select result ->> 'already_cancelled' from (select public.fn_cancel_ownership_transfer((select (result->'transfer'->>'id')::uuid from xfer where key = 'TB')) as result) q),
  'true',
  'cancelling again is a no-op'
);

select throws_ok(
  $$ select public.fn_cancel_ownership_transfer((select (result->'transfer'->>'id')::uuid from xfer where key = 'T1')) $$,
  '55000',
  null,
  'a completed transfer cannot be cancelled'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*) from public.sub_batch_reservation where transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TB')),
  0::bigint,
  'cancelling released the reservation'
);

select is(
  (select status from public.ownership_transfer where id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TB')),
  'cancelled',
  'the transfer is cancelled'
);

select ok(
  (select cancelled_at is null and accepted_at is null from public.organisation_link_request where id = (select id from lr where key = 'AB')),
  'the request is still open'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$ select public.fn_update_batch_storage_record('77000000-0000-0000-0000-000000000003', null, 'edited after release') $$,
  'storage can be edited through the RPC once the reservation is gone'
);

select is(
  (select notes from public.batch_storage where id = '77000000-0000-0000-0000-000000000003'),
  'edited after release',
  'the edit took effect'
);

select throws_ok(
  $$ update public.batch_storage set notes = 'direct edit' where id = '77000000-0000-0000-0000-000000000003' $$,
  '42501',
  null,
  'a direct client update stays denied after release'
);

select lives_ok(
  $$ select public.fn_set_sub_batch_storage('7f000000-0000-0000-0000-000000000007', '79000000-0000-0000-0000-000000000002') $$,
  'a released bag can be moved'
);

select lives_ok(
  $$ select public.fn_split_sub_batch('7f000000-0000-0000-0000-000000000007', '[{"weight_grams":5}]'::jsonb) $$,
  'a released bag can be split'
);

-- Accept.
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Member","permissions":["inventory"]}}',
  true
);

select throws_ok(
  $$ select public.fn_respond_transfer_link_request((select id from lr where key = 'AB'), true) $$,
  '42501',
  null,
  'a recipient Member cannot respond to a request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000006","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000003","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_respond_transfer_link_request((select id from lr where key = 'AB'), true) $$,
  '42501',
  null,
  'another organisation''s Admin cannot respond to the request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select public.fn_respond_transfer_link_request('73000000-0000-0000-0000-000000000002', true) $$,
  'P0002',
  null,
  'an unknown request is rejected'
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'ACC', public.fn_respond_transfer_link_request((select id from lr where key = 'AB'), true)
  $$,
  'the recipient Admin accepts the request'
);

select results_eq(
  $$
    select
      result ->> 'accepted',
      jsonb_array_length(result -> 'completed_transfers')::text,
      jsonb_array_length(result -> 'cancelled_transfer_ids')::text,
      result ->> 'already_resolved'
    from xfer where key = 'ACC'
  $$,
  $$ values ('true'::text, '1'::text, '0'::text, 'false'::text) $$,
  'accepting completes the waiting transfer and reports no cancellations'
);

select is(
  (select public.fn_respond_transfer_link_request((select id from lr where key = 'AB'), true) ->> 'already_resolved'),
  'true',
  'accepting twice is reported as already resolved'
);

reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pb as
select oti.* from public.ownership_transfer_item oti where oti.transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TA');

select is(
  (select status from public.ownership_transfer where id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TA')),
  'completed',
  'the accepted transfer is completed'
);

select is(
  (select count(*) from public.sub_batch_reservation),
  0::bigint,
  'accepting released every reservation'
);

select is(
  (select count(id) from public.organisation_link where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000002' and kind = 'transfer'),
  1::bigint,
  'accepting created the transfer link'
);

select ok(
  (select accepted_at is not null and accepted_by = '7a000000-0000-0000-0000-000000000004' from public.organisation_link_request where id = (select id from lr where key = 'AB')),
  'the request records who accepted it'
);

select is(
  (select status from public.ownership_transfer where id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TB')),
  'cancelled',
  'the cancelled transfer was not reopened'
);

select is(
  (select count(*) from public.batches where organisation_id = '7b000000-0000-0000-0000-000000000002' and received_transfer_item_id is not null),
  3::bigint,
  'the recipient got one new batch per bag'
);

select is(
  (select count(*) from pb where received_batch_id is not null and received_sub_batch_id is not null and seed_transfer_item_id is not null),
  3::bigint,
  'every item has its completion mapping'
);

select results_eq(
  $$
    select s.weight_grams
    from public.sub_batches s
    inner join pb on pb.received_sub_batch_id = s.id
    order by s.weight_grams
  $$,
  $$ values (20::numeric), (40::numeric), (50::numeric) $$,
  'the recipient sees one bag for the stored bag, the unstored bag and the split portion'
);

select is(
  (select count(*) from public.sub_batches s inner join pb on pb.received_sub_batch_id = s.id where s.held_by_org_id = '7b000000-0000-0000-0000-000000000002'),
  3::bigint,
  'the recipient holds all three received bags'
);

select is(
  (
    select count(*)
    from public.sub_batch_lineage l
    inner join pb on pb.sub_batch_id = l.source_sub_batch_id and pb.received_sub_batch_id = l.derived_sub_batch_id
    where l.operation_kind = 'transfer'
  ),
  3::bigint,
  'each received bag has its lineage edge'
);

select is(
  (select count(*) from public.sub_batch_current_weight w where w.id in (select sub_batch_id from pb) and w.current_weight = 0),
  3::bigint,
  'the source bags dropped to zero'
);

select is((select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000006'), 100::numeric, 'the portion''s source bag kept the rest');

select ok(
  exists (select 1 from public.batch_storage where sub_batch_id = '7f000000-0000-0000-0000-000000000003' and moved_out_at is not null)
  and not exists (select 1 from public.batch_storage where sub_batch_id = '7f000000-0000-0000-0000-000000000003' and moved_out_at is null),
  'accepting closed the stored bag''s storage even though the accepter does not hold the bag'
);

select is(
  (select count(*) from public.batch_storage where sub_batch_id = '7f000000-0000-0000-0000-000000000004'),
  0::bigint,
  'an unstored bag needed no storage change'
);

select is(
  (select count(*) from public.species where organisation_id = '7b000000-0000-0000-0000-000000000002'),
  2::bigint,
  'the recipient''s existing species were matched by guid and by case-insensitive name'
);

select set_eq(
  $$
    select s.name
    from public.species s
    inner join public.batches b on b.species_id = s.id
    where b.organisation_id = '7b000000-0000-0000-0000-000000000002' and b.received_transfer_item_id is not null
  $$,
  $$ values ('Xfer Acacia local'::text), ('XFER BANKSIA TESTA'::text) $$,
  'received batches use the recipient''s own species rows'
);

select results_eq(
  $$
    select b.source_collection_code, b.source_collection_year
    from public.batches b
    inner join pb on pb.received_batch_id = b.id
    where pb.weight_grams = 20
  $$,
  $$ values ('XFER-CA2'::text, 2023::smallint) $$,
  'the portion''s batch carries its own collection code and year'
);

-- Once linked, sends are immediate.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TC', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000011"}]'::jsonb, null, '76000000-0000-0000-0000-000000000018'
    )
  $$,
  'a send to a newly linked recipient is immediate'
);

select results_eq(
  $$
    select result -> 'transfer' ->> 'status', result ->> 'link_request_created'
    from xfer where key = 'TC'
  $$,
  $$ values ('completed'::text, 'false'::text) $$,
  'it completes at once and opens no request'
);

-- Link isolation once a transfer link exists.
select lives_ok(
  $$ delete from public.organisation_link where kind = 'transfer' and provider_org_id = '7b000000-0000-0000-0000-000000000002' $$,
  'a sender Admin deleting a transfer link affects nothing'
);

select is(
  (select count(id) from public.organisation_link where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000002' and kind = 'transfer'),
  1::bigint,
  'the transfer link is still there'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select count(id) from public.organisation where id = '7b000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a transfer link does not expose the sender''s organisation row to the recipient'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000011","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000008","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select count(id) from public.organisation where id = '7b000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a testing link still exposes the requester to the provider'
);

-- Decline: D to B has no link yet.
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000007","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TD', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000012"}]'::jsonb, null, '76000000-0000-0000-0000-000000000019'
    )
  $$,
  'a second sender sends to B'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into lr (key, id)
select 'DB', r.id
from public.organisation_link_request r
where r.requesting_org_id = '7b000000-0000-0000-0000-000000000004' and r.provider_org_id = '7b000000-0000-0000-0000-000000000002' and r.kind = 'transfer';

select is(
  (select count(*) from public.sub_batch_reservation where transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TD')),
  1::bigint,
  'the pending bag is reserved'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'DEC', public.fn_respond_transfer_link_request((select id from lr where key = 'DB'), false)
  $$,
  'the recipient Admin declines the request'
);

select results_eq(
  $$
    select result ->> 'accepted', jsonb_array_length(result -> 'cancelled_transfer_ids')::text
    from xfer where key = 'DEC'
  $$,
  $$ values ('false'::text, '1'::text) $$,
  'declining closes the waiting transfer'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$
    select
      (select status from public.ownership_transfer where id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TD')),
      (select declined_at is not null and declined_by = '7a000000-0000-0000-0000-000000000004' from public.organisation_link_request where id = (select id from lr where key = 'DB')),
      (select count(*) from public.sub_batch_reservation where transfer_id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TD'))
  $$,
  $$ values ('declined'::text, true, 0::bigint) $$,
  'a declined transfer and request are closed and the reservation is released'
);

select is(
  (select count(id) from public.organisation_link where requesting_org_id = '7b000000-0000-0000-0000-000000000004' and provider_org_id = '7b000000-0000-0000-0000-000000000002'),
  0::bigint,
  'declining creates no link'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000007","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$ select public.fn_split_sub_batch('7f000000-0000-0000-0000-000000000012', '[{"weight_grams":2}]'::jsonb) $$,
  'a declined bag can be split again'
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TD2', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000012"}]'::jsonb, null, '76000000-0000-0000-0000-000000000020'
    )
  $$,
  'after a decline the sender can ask again'
);

select is(
  (select (result ->> 'link_request_created')::boolean from xfer where key = 'TD2'),
  true,
  'a new request is opened, since the declined one is closed'
);

-- Accept-time revalidation: a bag that stopped qualifying cancels its transfer.
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000010","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000007","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TH2', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000002', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000015"}]'::jsonb, null, '76000000-0000-0000-0000-000000000021'
    )
  $$,
  'a third sender sends to B'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into lr (key, id)
select 'HB', r.id
from public.organisation_link_request r
where r.requesting_org_id = '7b000000-0000-0000-0000-000000000007' and r.provider_org_id = '7b000000-0000-0000-0000-000000000002' and r.kind = 'transfer';

delete from public.sub_batch_reservation where sub_batch_id = '7f000000-0000-0000-0000-000000000015';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'HACC', public.fn_respond_transfer_link_request((select id from lr where key = 'HB'), true)
  $$,
  'the accept does not fail when a bag no longer qualifies'
);

select results_eq(
  $$
    select
      result ->> 'accepted',
      jsonb_array_length(result -> 'completed_transfers')::text,
      jsonb_array_length(result -> 'cancelled_transfer_ids')::text
    from xfer where key = 'HACC'
  $$,
  $$ values ('true'::text, '0'::text, '1'::text) $$,
  'the failing transfer is cancelled instead'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$
    select
      (select status from public.ownership_transfer where id = (select (result->'transfer'->>'id')::uuid from xfer where key = 'TH2')),
      (select count(id) from public.organisation_link where requesting_org_id = '7b000000-0000-0000-0000-000000000007' and provider_org_id = '7b000000-0000-0000-0000-000000000002' and kind = 'transfer'),
      (select w_.current_weight from public.sub_batch_current_weight w_ where w_.id = '7f000000-0000-0000-0000-000000000015')
  $$,
  $$ values ('cancelled'::text, 1::bigint, 12::numeric) $$,
  'the bag stayed with its sender while the link was still created'
);

-- ===========================================================================
-- 8. Opt-out of F, which holds an accepted link from A
-- ===========================================================================

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000007","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'FD', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000006', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000013"}]'::jsonb, null, '76000000-0000-0000-0000-000000000022'
    )
  $$,
  'sender D asks F'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000010","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000007","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'FH', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000006', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000014"}]'::jsonb, null, '76000000-0000-0000-0000-000000000023'
    )
  $$,
  'sender H asks F'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into lr (key, id)
select 'DF', r.id
from public.organisation_link_request r
where r.requesting_org_id = '7b000000-0000-0000-0000-000000000004' and r.provider_org_id = '7b000000-0000-0000-0000-000000000006' and r.kind = 'transfer';

select results_eq(
  $$
    select
      (select count(*) from public.organisation_link_request where provider_org_id = '7b000000-0000-0000-0000-000000000006' and kind = 'transfer' and accepted_at is null and declined_at is null and cancelled_at is null),
      (select count(*) from public.sub_batch_reservation r inner join public.ownership_transfer ot on ot.id = r.transfer_id where ot.recipient_org_id = '7b000000-0000-0000-0000-000000000006')
  $$,
  $$ values (2::bigint, 2::bigint) $$,
  'F has two open requests from different senders with a reservation each'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000009","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000006","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'OPT', public.fn_set_accepts_transfers(false)
  $$,
  'F opts out'
);

select results_eq(
  $$
    select
      result ->> 'changed',
      jsonb_array_length(result -> 'cancelled_request_ids')::text,
      jsonb_array_length(result -> 'cancelled_transfer_ids')::text
    from xfer where key = 'OPT'
  $$,
  $$ values ('true'::text, '2'::text, '2'::text) $$,
  'opting out cancels both pending requests and their transfers'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$
    select
      (select count(*) from public.organisation_link_request where provider_org_id = '7b000000-0000-0000-0000-000000000006' and kind = 'transfer' and accepted_at is null and declined_at is null and cancelled_at is null),
      (select count(*) from public.organisation_link_request where provider_org_id = '7b000000-0000-0000-0000-000000000006' and kind = 'transfer' and cancelled_at is not null),
      (select count(*) from public.ownership_transfer where recipient_org_id = '7b000000-0000-0000-0000-000000000006' and status = 'cancelled'),
      (select count(*) from public.sub_batch_reservation r inner join public.ownership_transfer ot on ot.id = r.transfer_id where ot.recipient_org_id = '7b000000-0000-0000-0000-000000000006')
  $$,
  $$ values (0::bigint, 2::bigint, 2::bigint, 0::bigint) $$,
  'no request stays open and every reservation is released'
);

select ok(
  (select not accepts_transfers from public.organisation where id = '7b000000-0000-0000-0000-000000000006')
  and exists (select 1 from public.organisation_link where requesting_org_id = '7b000000-0000-0000-0000-000000000001' and provider_org_id = '7b000000-0000-0000-0000-000000000006' and kind = 'transfer'),
  'the flag is off and the accepted link is kept dormant'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000007","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000004","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000006', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000013"}]'::jsonb, null, '76000000-0000-0000-0000-000000000024'
    )
  $$,
  '42501',
  null,
  'a new request to an opted-out organisation is rejected'
);

select lives_ok(
  $$ select public.fn_split_sub_batch('7f000000-0000-0000-0000-000000000013', '[{"weight_grams":2}]'::jsonb) $$,
  'the bag that was waiting on the opted-out recipient is free again'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$
    select public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000006', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000010"}]'::jsonb, null, '76000000-0000-0000-0000-000000000025'
    )
  $$,
  '42501',
  null,
  'a dormant accepted link does not allow an immediate send'
);

select is(
  (select count(*) from public.fn_transfer_directory() where name = 'Xfer F optout'),
  0::bigint,
  'an opted-out organisation leaves the directory'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000009","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000006","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select public.fn_respond_transfer_link_request((select id from lr where key = 'DF'), true) ->> 'already_resolved'),
  'true',
  'a cancelled request can no longer be answered'
);

select results_eq(
  $$
    select
      result ->> 'changed',
      jsonb_array_length(result -> 'cancelled_request_ids')::text,
      jsonb_array_length(result -> 'cancelled_transfer_ids')::text
    from (select public.fn_set_accepts_transfers(true) as result) q
  $$,
  $$ values ('true'::text, '0'::text, '0'::text) $$,
  'F opts back in'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$
    select
      (select count(*) from public.organisation_link_request where provider_org_id = '7b000000-0000-0000-0000-000000000006' and kind = 'transfer' and accepted_at is null and declined_at is null and cancelled_at is null),
      (select count(*) from public.ownership_transfer where recipient_org_id = '7b000000-0000-0000-0000-000000000006' and status = 'cancelled')
  $$,
  $$ values (0::bigint, 2::bigint) $$,
  'opting back in does not reopen cancelled requests or transfers'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'TF', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000006', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000010"}]'::jsonb, null, '76000000-0000-0000-0000-000000000026'
    )
  $$,
  'the accepted link works again after re-enabling'
);

select is(
  (select result -> 'transfer' ->> 'status' from xfer where key = 'TF'),
  'completed',
  'the restored link makes the send immediate'
);

select is(
  (select is_linked from public.fn_transfer_directory() where name = 'Xfer F optout'),
  true,
  'the directory lists F again as linked'
);

-- ===========================================================================
-- 9. Testing regressions
-- ===========================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000010","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000007","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$
    insert into xfer (key, result)
    select 'HL', public.fn_send_bags_for_transfer(
      '7b000000-0000-0000-0000-000000000008', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000016"}]'::jsonb, null, '76000000-0000-0000-0000-000000000027'
    )
  $$,
  'a testing provider that opted in can receive a transfer request'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into lr (key, id)
select 'HL', r.id
from public.organisation_link_request r
where r.requesting_org_id = '7b000000-0000-0000-0000-000000000007' and r.provider_org_id = '7b000000-0000-0000-0000-000000000008' and r.kind = 'transfer';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000011","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000008","role":"Admin","permissions":[]}}',
  true
);

select lives_ok(
  $$ select public.fn_respond_transfer_link_request((select id from lr where key = 'HL'), true) $$,
  'the testing provider Admin accepts it'
);

select is(
  (select count(*) from public.batches where organisation_id = '7b000000-0000-0000-0000-000000000008' and received_transfer_item_id is not null),
  1::bigint,
  'the testing provider owns the received batch'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000010","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000007","role":"Admin","permissions":[]}}',
  true
);

select throws_ok(
  $$ select * from public.fn_assign_bags_for_testing('7b000000-0000-0000-0000-000000000008', '[{"sub_batch_id":"7f000000-0000-0000-0000-000000000017"}]'::jsonb) $$,
  '42501',
  null,
  'a transfer link does not allow sending for testing'
);

reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  not public.is_linked_testing_provider('7b000000-0000-0000-0000-000000000007', '7b000000-0000-0000-0000-000000000008')
  and public.is_linked_testing_provider('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-000000000008'),
  'testing link checks ignore transfer links and still see testing links'
);

-- ===========================================================================
-- 10. Visibility
-- ===========================================================================

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000002","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select count(id) from public.collection where organisation_id = '7b000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the recipient cannot read the sender''s collections'
);

select is(
  (select count(id) from public.batches where organisation_id = '7b000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the recipient cannot read the sender''s batches'
);

select is(
  (select count(id) from public.sub_batches where batch_id in ('7e000000-0000-0000-0000-000000000003', '7e000000-0000-0000-0000-000000000005', '7e000000-0000-0000-0000-000000000006')),
  0::bigint,
  'the recipient cannot read the sender''s bags'
);

select is(
  (select count(id) from public.batch_storage where location_id in ('79000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000002')),
  0::bigint,
  'the recipient cannot read the sender''s storage'
);

select is(
  (select count(id) from public.storage_locations where organisation_id = '7b000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the recipient cannot read the sender''s storage locations'
);

select is(
  (select count(id) from public.ownership_transfer),
  6::bigint,
  'the recipient reads the transfers it is a party to'
);

select is(
  (select count(id) from public.ownership_transfer_item),
  8::bigint,
  'the recipient reads their items'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000001","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select count(id) from public.batches where id in (select received_batch_id from public.ownership_transfer_item where received_batch_id is not null)),
  0::bigint,
  'the sender cannot read any received batch'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000008","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000005","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select count(id) from public.ownership_transfer),
  0::bigint,
  'an unrelated organisation sees no transfers'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000006","role":"authenticated","app_metadata":{"org_id":"7b000000-0000-0000-0000-000000000003","role":"Admin","permissions":[]}}',
  true
);

select is(
  (select count(id) from public.seed_transfer_event where kind = 'ownership_transfer'),
  2::bigint,
  'a recipient reads the ledger events addressed to it'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
