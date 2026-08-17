begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_table(
  'public',
  'sub_batch_lineage',
  'structured sub-batch lineage is persisted'
);

select columns_are(
  'public',
  'sub_batch_lineage',
  array[
    'id',
    'source_sub_batch_id',
    'derived_sub_batch_id',
    'operation_kind',
    'operation_id',
    'created_at',
    'created_by'
  ],
  'lineage records both ends and the operation that derived the bag'
);

select has_function(
  'public',
  'fn_resolve_testing_assignments_for_sub_batch',
  array['uuid'],
  'a recursive bag-to-assignment resolver exists'
);

-- Use the seeded, closed testing assignment as a stable ancestry root. The
-- contract applies to historical and open assignments alike.
insert into public.sub_batches (id, batch_id, weight_grams, notes)
values
  (
    'fa000000-0000-0000-0000-000000000001',
    'adedaba3-ffe6-460e-babd-2439793fe8f9',
    20,
    'First lineage split child'
  ),
  (
    'fa000000-0000-0000-0000-000000000002',
    'adedaba3-ffe6-460e-babd-2439793fe8f9',
    30,
    'Second lineage split child'
  ),
  (
    'fa000000-0000-0000-0000-000000000003',
    'adedaba3-ffe6-460e-babd-2439793fe8f9',
    50,
    'Merged lineage destination'
  );

insert into public.sub_batch_lineage (
  source_sub_batch_id,
  derived_sub_batch_id,
  operation_kind,
  operation_id
)
values
  (
    'efe5355a-37b1-4581-8c6d-36f979afe128',
    'fa000000-0000-0000-0000-000000000001',
    'split',
    'fb000000-0000-0000-0000-000000000001'
  ),
  (
    'efe5355a-37b1-4581-8c6d-36f979afe128',
    'fa000000-0000-0000-0000-000000000002',
    'split',
    'fb000000-0000-0000-0000-000000000001'
  ),
  (
    'fa000000-0000-0000-0000-000000000001',
    'fa000000-0000-0000-0000-000000000003',
    'merge',
    'fb000000-0000-0000-0000-000000000002'
  ),
  (
    'fa000000-0000-0000-0000-000000000002',
    'fa000000-0000-0000-0000-000000000003',
    'merge',
    'fb000000-0000-0000-0000-000000000002'
  );

select results_eq(
  $$
    select assignment_id
    from public.fn_resolve_testing_assignments_for_sub_batch(
      'efe5355a-37b1-4581-8c6d-36f979afe128'
    )
  $$,
  $$ values ('c49869fd-adaf-4811-87d1-52ec900a8059'::uuid) $$,
  'an originally dispatched bag resolves to its own assignment'
);

select results_eq(
  $$
    select assignment_id
    from public.fn_resolve_testing_assignments_for_sub_batch(
      'fa000000-0000-0000-0000-000000000001'
    )
  $$,
  $$ values ('c49869fd-adaf-4811-87d1-52ec900a8059'::uuid) $$,
  'a split descendant resolves its source assignment'
);

select results_eq(
  $$
    select assignment_id
    from public.fn_resolve_testing_assignments_for_sub_batch(
      'fa000000-0000-0000-0000-000000000003'
    )
  $$,
  $$ values ('c49869fd-adaf-4811-87d1-52ec900a8059'::uuid) $$,
  'a merge descendant collapses duplicate assignment ancestry'
);

select throws_ok(
  $$
    insert into public.sub_batch_lineage (
      source_sub_batch_id,
      derived_sub_batch_id,
      operation_kind,
      operation_id
    ) values (
      'fa000000-0000-0000-0000-000000000003',
      'efe5355a-37b1-4581-8c6d-36f979afe128',
      'merge',
      'fb000000-0000-0000-0000-000000000003'
    )
  $$,
  '23514',
  null,
  'lineage cycles are rejected'
);

insert into public.batches (id, organisation_id, code, weight_grams)
values (
  'fc000000-0000-0000-0000-000000000001',
  '2fd8367a-22b3-47a8-9803-7eb3a10e0be4',
  'FOREIGN-LINEAGE-OWNER',
  1
);

insert into public.sub_batches (id, batch_id, weight_grams)
values (
  'fd000000-0000-0000-0000-000000000001',
  'fc000000-0000-0000-0000-000000000001',
  1
);

select throws_ok(
  $$
    insert into public.sub_batch_lineage (
      source_sub_batch_id,
      derived_sub_batch_id,
      operation_kind,
      operation_id
    ) values (
      'efe5355a-37b1-4581-8c6d-36f979afe128',
      'fd000000-0000-0000-0000-000000000001',
      'cleaning',
      'fb000000-0000-0000-0000-000000000004'
    )
  $$,
  '23514',
  null,
  'lineage cannot cross seed owners'
);

select throws_ok(
  $$
    insert into public.sub_batch_lineage (
      source_sub_batch_id,
      derived_sub_batch_id,
      operation_kind,
      operation_id
    ) values (
      'efe5355a-37b1-4581-8c6d-36f979afe128',
      'efe5355a-37b1-4581-8c6d-36f979afe128',
      'split',
      'fb000000-0000-0000-0000-000000000005'
    )
  $$,
  '23514',
  null,
  'a bag cannot derive itself'
);

set local role authenticated;

select throws_ok(
  $$
    update public.sub_batch_lineage
    set operation_id = 'fb000000-0000-0000-0000-000000000099'
    where derived_sub_batch_id = 'fa000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated clients cannot rewrite lineage'
);

select throws_ok(
  $$
    delete from public.sub_batch_lineage
    where derived_sub_batch_id = 'fa000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  null,
  'authenticated clients cannot delete lineage'
);

select * from finish();

rollback;
