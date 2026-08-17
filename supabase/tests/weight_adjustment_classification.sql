begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_column(
  'public', 'batch_weight_adjustments', 'kind',
  'weight adjustments have a constrained semantic kind'
);

select has_column(
  'public', 'batch_weight_adjustments', 'test_id',
  'test consumption references the test that consumed seed'
);

select has_column(
  'public', 'batch_weight_adjustments', 'lineage_operation_id',
  'physical derivations reference their lineage operation'
);

select has_column(
  'public', 'batch_weight_adjustments', 'transfer_item_id',
  'custody variance can reference its transfer line'
);

select has_column(
  'public', 'batch_weight_adjustments', 'corrects_adjustment_id',
  'corrections can reference the adjustment they correct'
);

insert into public.batch_weight_adjustments (
  sub_batch_id,
  weight_grams,
  reason,
  created_by
)
values (
  'efe5355a-37b1-4581-8c6d-36f979afe128',
  1,
  'Manual correction classification probe',
  'e18b3927-87a9-4dcc-8d59-148461504a02'
);

select is(
  (
    select kind::text
    from public.batch_weight_adjustments
    where reason = 'Manual correction classification probe'
  ),
  'correction'::text,
  'legacy and manual inserts default to an explicit correction kind'
);

select throws_ok(
  $$
    insert into public.batch_weight_adjustments (
      sub_batch_id,
      weight_grams,
      reason,
      created_by,
      kind
    ) values (
      'efe5355a-37b1-4581-8c6d-36f979afe128',
      -1,
      'Invalid unreferenced test consumption',
      'e18b3927-87a9-4dcc-8d59-148461504a02',
      'test_consumption'
    )
  $$,
  '23514',
  null,
  'test consumption requires exactly its test reference'
);

select throws_ok(
  $$
    insert into public.batch_weight_adjustments (
      sub_batch_id,
      weight_grams,
      reason,
      created_by,
      kind,
      test_id
    ) values (
      'efe5355a-37b1-4581-8c6d-36f979afe128',
      1,
      'Invalid correction reference shape',
      'e18b3927-87a9-4dcc-8d59-148461504a02',
      'correction',
      '81eb3b8c-20de-4d4a-ab39-6a7a84d61a8d'
    )
  $$,
  '23514',
  null,
  'a correction cannot masquerade as test consumption'
);

select * from finish();

rollback;
