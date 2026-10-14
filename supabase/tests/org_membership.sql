begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- Seeded: the admin of the General organisation, and the admin of the testing
-- provider. Each belongs to their own organisation and to no other.
--   e18b3927… / 02aba5b9…   General organisation
--   b422f046… / 2fd8367a…   Testing provider

-- is_org_member used to compare the org_user.user_id column with itself, so it
-- said yes for anyone, as long as the organisation had any member. Called from a
-- test session this is the same view a SECURITY DEFINER function has: every
-- organisation's members are visible, nothing is filtered by row-level security.
select is(
  public.is_org_member(
    'e18b3927-87a9-4dcc-8d59-148461504a02',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  ),
  true,
  'a member belongs to their organisation'
);

select is(
  public.is_org_member(
    'b422f046-5d63-4afd-b56a-b89a12971951',
    '2fd8367a-22b3-47a8-9803-7eb3a10e0be4'
  ),
  true,
  'a testing provider member belongs to their organisation'
);

select is(
  public.is_org_member(
    'e18b3927-87a9-4dcc-8d59-148461504a02',
    '2fd8367a-22b3-47a8-9803-7eb3a10e0be4'
  ),
  false,
  'a member does not belong to another organisation'
);

select is(
  public.is_org_member(
    'b422f046-5d63-4afd-b56a-b89a12971951',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  ),
  false,
  'the other organisation''s member is not a member of the General organisation'
);

select is(
  public.is_org_member(
    'ee000000-0000-0000-0000-00000000dead',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  ),
  false,
  'a user who is in no organisation is not a member'
);

select is(
  public.is_org_member(null, '02aba5b9-6c46-406d-831a-4f51851599f2'),
  false,
  'no user at all is not a member'
);

select is(
  public.is_org_member(
    'e18b3927-87a9-4dcc-8d59-148461504a02',
    'ee000000-0000-0000-0000-00000000dead'
  ),
  false,
  'nobody is a member of an organisation that does not exist'
);

update public.org_user
set is_active = false
where user_id = 'b422f046-5d63-4afd-b56a-b89a12971951';

select is(
  public.is_org_member(
    'b422f046-5d63-4afd-b56a-b89a12971951',
    '2fd8367a-22b3-47a8-9803-7eb3a10e0be4'
  ),
  false,
  'a deactivated user is no longer a member'
);

-- fn_merge_batches, fn_mix_batches and fn_split_batch are SECURITY DEFINER and
-- guard themselves with is_org_member. With the old function the check passed for
-- any caller, so the batches of one organisation could be operated on by a user
-- of another. Two batches held by the General organisation, and callers from
-- each side of that line.
insert into public.batches (id, organisation_id, code)
values
  (
    'ee000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'ORG-MEMBERSHIP-TEST-1'
  ),
  (
    'ee000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2',
    'ORG-MEMBERSHIP-TEST-2'
  );

insert into public.batch_custody (batch_id, organisation_id)
values
  (
    'ee000000-0000-0000-0000-000000000001',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  ),
  (
    'ee000000-0000-0000-0000-000000000002',
    '02aba5b9-6c46-406d-831a-4f51851599f2'
  );

-- The testing provider's admin, who has no business with these batches.
select set_config(
  'request.jwt.claims',
  '{"sub":"b422f046-5d63-4afd-b56a-b89a12971951","role":"authenticated","app_metadata":{"org_id":"2fd8367a-22b3-47a8-9803-7eb3a10e0be4","role":"Admin"}}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.fn_merge_batches(
      array[
        'ee000000-0000-0000-0000-000000000001',
        'ee000000-0000-0000-0000-000000000002'
      ]::uuid[]
    )
  $$,
  'P0001',
  'Permission denied: not a member of the custodian organisation',
  'another organisation cannot merge these batches'
);

select throws_ok(
  $$
    select public.fn_mix_batches(
      array[
        'ee000000-0000-0000-0000-000000000001',
        'ee000000-0000-0000-0000-000000000002'
      ]::uuid[]
    )
  $$,
  'P0001',
  'Permission denied: not a member of the custodian organisation',
  'another organisation cannot mix these batches'
);

select throws_ok(
  $$ select public.fn_split_batch('ee000000-0000-0000-0000-000000000001') $$,
  'P0001',
  'Permission denied: not current custodian of parent batch',
  'another organisation cannot split this batch'
);

-- The owner gets past the same guard: the merge is refused further on, because
-- these fixtures have no collection, not because of who is asking.
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"e18b3927-87a9-4dcc-8d59-148461504a02","role":"authenticated","app_metadata":{"org_id":"02aba5b9-6c46-406d-831a-4f51851599f2","role":"Admin"}}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.fn_merge_batches(
      array[
        'ee000000-0000-0000-0000-000000000001',
        'ee000000-0000-0000-0000-000000000002'
      ]::uuid[]
    )
  $$,
  'P0001',
  'All batches must be derived from the same collection',
  'the owning organisation passes the membership guard'
);

reset role;

select * from finish();

rollback;
