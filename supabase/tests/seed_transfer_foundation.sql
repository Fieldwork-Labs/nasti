begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_table('public', 'seed_transfer_event', 'seed transfer headers exist');
select has_table('public', 'seed_transfer_item', 'seed transfer line items exist');

select columns_are(
  'public',
  'seed_transfer_event',
  array[
    'id',
    'sender_org_id',
    'recipient_org_id',
    'kind',
    'effective_at',
    'recorded_at',
    'recorded_by',
    'reverses_event_id',
    'corrects_event_id',
    'reason'
  ],
  'transfer headers expose only immutable event facts'
);

select columns_are(
  'public',
  'seed_transfer_item',
  array[
    'id',
    'transfer_event_id',
    'sub_batch_id',
    'batch_id',
    'owner_org_id',
    'weight_grams'
  ],
  'transfer items snapshot the moved bag, parent, owner, and weight'
);

select col_not_null('public', 'seed_transfer_event', 'sender_org_id', 'transfer sender is required');
select col_not_null('public', 'seed_transfer_event', 'recipient_org_id', 'transfer recipient is required');
select col_not_null('public', 'seed_transfer_event', 'effective_at', 'effective timestamp is required');
select col_not_null('public', 'seed_transfer_event', 'recorded_at', 'recorded timestamp is required');
select col_not_null('public', 'seed_transfer_event', 'recorded_by', 'transfer actor is required');
select col_not_null('public', 'seed_transfer_item', 'transfer_event_id', 'item header is required');
select col_not_null('public', 'seed_transfer_item', 'sub_batch_id', 'moved bag is required');
select col_not_null('public', 'seed_transfer_item', 'batch_id', 'parent batch is required');
select col_not_null('public', 'seed_transfer_item', 'owner_org_id', 'owner snapshot is required');
select col_not_null('public', 'seed_transfer_item', 'weight_grams', 'weight snapshot is required');
select col_not_null(
  'public',
  'batch_testing_assignment',
  'outbound_transfer_item_id',
  'every testing assignment points to its outbound transfer item'
);

select results_eq(
  $$
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('seed_transfer_event', 'seed_transfer_item')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  $$,
  array[0],
  'clients cannot directly mutate transfer facts'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_trigger
    where tgrelid in (
      'public.seed_transfer_event'::regclass,
      'public.seed_transfer_item'::regclass
    )
      and tgname in (
        'seed_transfer_event_append_only',
        'seed_transfer_item_append_only'
      )
      and not tgisinternal
  $$,
  array[2],
  'database triggers keep transfer headers and items append-only for every role'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'seed_transfer_item'
      and indexdef like '%UNIQUE%'
      and indexdef like '%id, sub_batch_id, batch_id%'
  $$,
  array[1],
  'transfer items expose a composite identity for assignment consistency'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.batch_testing_assignment'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like
        '%outbound_transfer_item_id, sub_batch_id, batch_id%seed_transfer_item%'
  $$,
  array[1],
  'assignment bag and batch must match its outbound transfer item'
);

select * from finish();

rollback;
