# Ownership transfer: two-session concurrency checks

Status: written, **not run**. Plan reference: `docs/plans/2026-11-18-transfer.md`
section 5 ("Concurrency") and section 2.1 (lock order).

pgTAP runs in a single session, so none of these interleavings can be staged in
`ownership_transfer.sql`. `dblink` is not enabled by any migration or by
`supabase/config.toml` (checked), so the cases below use two `psql` sessions
instead. Record which cases ran, and their result, in the table at the end.

## How the interleavings are staged

Every case has the same shape:

1. Session 1 opens a transaction, impersonates a caller, makes the first call
   and then holds the transaction open with `pg_sleep` (it holds every lock the
   call took: recipient organisation row, pair advisory lock, bag and batch
   rows).
2. Session 2 starts about one second later, impersonates another caller and
   makes the second call. It must **block** on session 1's locks. Check with
   `pg_stat_activity` (`wait_event_type = 'Lock'` or `'Advisory'`) from a third
   connection while session 1 sleeps.
3. Session 1 commits. Session 2 then proceeds against the committed state.
4. Run the invariant queries at the end of this file on a third connection.

Fixtures must be **committed** (the sessions are separate), so they are created
by `setup.sql` below and removed by `teardown.sql`. Use a scratch local
database (`supabase db reset` is the user's call; this file never runs it).

### Connection

```sh
export PGURL='postgresql://postgres:postgres@127.0.0.1:57322/postgres'
psql "$PGURL" -v ON_ERROR_STOP=1 -f setup.sql
```

### Impersonation snippet (put at the top of each session script)

```sql
\set a_admin '{"sub":"ccb00000-0000-0000-0000-0000000000a1","role":"authenticated","app_metadata":{"org_id":"ccb10000-0000-0000-0000-0000000000a1","role":"Admin","permissions":[]}}'
\set d_admin '{"sub":"ccb00000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"org_id":"ccb10000-0000-0000-0000-0000000000d1","role":"Admin","permissions":[]}}'
\set b_admin '{"sub":"ccb00000-0000-0000-0000-0000000000b1","role":"authenticated","app_metadata":{"org_id":"ccb10000-0000-0000-0000-0000000000b1","role":"Admin","permissions":[]}}'
begin;
select set_config('request.jwt.claims', :'a_admin', true);   -- or d_admin / b_admin
set local role authenticated;
```

### setup.sql

```sql
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','ccb00000-0000-0000-0000-0000000000a1','authenticated','authenticated','cc-a@test.invalid'),
  ('00000000-0000-0000-0000-000000000000','ccb00000-0000-0000-0000-0000000000d1','authenticated','authenticated','cc-d@test.invalid'),
  ('00000000-0000-0000-0000-000000000000','ccb00000-0000-0000-0000-0000000000b1','authenticated','authenticated','cc-b@test.invalid');

insert into public.organisation (id, name, owner_id, accepts_transfers) values
  ('ccb10000-0000-0000-0000-0000000000a1','CC sender A','ccb00000-0000-0000-0000-0000000000a1', false),
  ('ccb10000-0000-0000-0000-0000000000d1','CC sender D','ccb00000-0000-0000-0000-0000000000d1', false),
  ('ccb10000-0000-0000-0000-0000000000b1','CC recipient B','ccb00000-0000-0000-0000-0000000000b1', true);

insert into public.org_user (organisation_id, user_id, role, is_active, permissions) values
  ('ccb10000-0000-0000-0000-0000000000a1','ccb00000-0000-0000-0000-0000000000a1','Admin',true,'{}'),
  ('ccb10000-0000-0000-0000-0000000000d1','ccb00000-0000-0000-0000-0000000000d1','Admin',true,'{}'),
  ('ccb10000-0000-0000-0000-0000000000b1','ccb00000-0000-0000-0000-0000000000b1','Admin',true,'{}');

insert into public.species (id, name, organisation_id) values
  ('ccb20000-0000-0000-0000-0000000000a1','CC species A','ccb10000-0000-0000-0000-0000000000a1'),
  ('ccb20000-0000-0000-0000-0000000000d1','CC species D','ccb10000-0000-0000-0000-0000000000d1');

-- Collectionless batches keep the fixture small. A holds batches 1-6 (two
-- bags in batch 5 and in batch 6), D holds batch 7.
insert into public.batches (id, species_id, organisation_id, code)
select ('ccb30000-0000-0000-0000-00000000000' || n)::uuid,
       case when n = 7 then 'ccb20000-0000-0000-0000-0000000000d1'::uuid else 'ccb20000-0000-0000-0000-0000000000a1'::uuid end,
       case when n = 7 then 'ccb10000-0000-0000-0000-0000000000d1'::uuid else 'ccb10000-0000-0000-0000-0000000000a1'::uuid end,
       'CC-' || n
from generate_series(1, 7) n;

insert into public.batch_custody (batch_id, organisation_id)
select id, organisation_id from public.batches where code like 'CC-%';

insert into public.sub_batches (id, batch_id, weight_grams, notes)
select ('ccb40000-0000-0000-0000-00000000000' || n)::uuid,
       ('ccb30000-0000-0000-0000-00000000000' || least(n, 7))::uuid,
       100, 'CC bag ' || n
from generate_series(1, 8) n;
-- bags 1..8 -> batches 1..7 (bag 8 shares batch 7 with bag 7)

insert into public.storage_locations (id, organisation_id, name, active)
values ('ccb50000-0000-0000-0000-0000000000a1','ccb10000-0000-0000-0000-0000000000a1','CC shelf',true);

insert into public.batch_storage (id, batch_id, sub_batch_id, location_id, stored_at)
values ('ccb60000-0000-0000-0000-000000000003','ccb30000-0000-0000-0000-000000000003',
        'ccb40000-0000-0000-0000-000000000003','ccb50000-0000-0000-0000-0000000000a1', now() - interval '1 day');
```

Bag map (A holds bags 1-6, D holds 7 and 8): bags 1 and 2 are the
simultaneous-first-send probes; bag 3 (stored) is the storage-edit probe; bag 4
is the cancel and opt-out probe; bags 5 and 6 are in separate batches and serve
the whole-batch cases. `fn_merge_batches` and `fn_mix_batches` also need both
batches to share one collection (and so species and IBRA region), so for C4b
add a `collection` row for A and point batches 5 and 6 at it (same `code` on
both batches for the merge). The **invariants** below do not depend on the map.

### teardown.sql

```sql
-- Order matters (RESTRICT foreign keys). Run as the table owner.
alter table public.sub_batch_lineage disable trigger sub_batch_lineage_reject_rewrite;
alter table public.seed_transfer_item disable trigger seed_transfer_item_append_only;
alter table public.seed_transfer_event disable trigger seed_transfer_event_append_only;
alter table public.batches disable trigger batches_provenance_guard;
delete from public.ownership_transfer_test_snapshot;
delete from public.ownership_transfer_storage_snapshot;
delete from public.sub_batch_reservation;
delete from public.sub_batch_lineage where source_sub_batch_id in (select id from public.sub_batches where notes like 'CC bag %');
-- delete received batches, items, transfers, requests, links, batches, bags,
-- storage, custody, species, org_user, organisations, users created above
-- (filter every delete on the 'ccb...' ids or the 'CC ' name prefix).
alter table public.batches enable trigger batches_provenance_guard;
alter table public.seed_transfer_event enable trigger seed_transfer_event_append_only;
alter table public.seed_transfer_item enable trigger seed_transfer_item_append_only;
alter table public.sub_batch_lineage enable trigger sub_batch_lineage_reject_rewrite;
```

Simplest teardown for a throwaway database is `supabase db reset`.

## Cases

For each case, "S1" and "S2" are the two scripts; start S1, `sleep 1`, start S2
in the background, wait for both. Expected outcomes are given as "either order
is acceptable" where both serialisations are correct; the invariants must hold
in every one.

### C1. Simultaneous first sends to one recipient

Two sub-cases, same shape.

**C1a, one sender, two requests.** A (S1) sends bag 1 to B with request id
`ccb70000-...-01`; A (S2) sends bag 2 to B with request id `...-02`; B has no
link.

- S1 body: `select public.fn_send_bags_for_transfer('ccb10000-...-b1', '[{"sub_batch_id":"ccb40000-...-01"}]', null, 'ccb70000-0000-0000-0000-000000000001'); select pg_sleep(4); commit;`
- S2 body: the same with bag 2 and request id `...-02`, no sleep.

Expect: both calls succeed. S1 creates the request (`link_request_created =
true`); S2 attaches to it (`link_request_created = false`) because it waited on
the pair advisory lock. Exactly one open `transfer` request for A to B
(unique index `organisation_link_request_open_transfer_unique`); both transfers
carry that `link_request_id`; two reservations.

**C1b, two senders.** A (S1) and D (S2) send to B at once. The pair locks
differ, so neither waits on the other, but both take `FOR SHARE` on B's
organisation row, which is compatible. Expect two requests (one per pair), both
open, two reservations, no deadlock. (If a deadlock error appears, record the
`pg_locks` rows; it would mean the 2.1 order is violated somewhere.)

**C1c, duplicate send with one request id (replay under contention).** A (S1)
and A (S2) both send bag 1 to B with the **same** request id.

Expect: one transfer row for the key, one reservation, `replayed = true` for
exactly one of the two results, no 23505 escaping to the caller (the pair lock
serialises them; a 23505 here would be the "different recipient" collision, so
use the same recipient). With a link in place (insert an `organisation_link`
row of `kind = 'transfer'` A to B first) the same case must produce **one
completion**: one `ownership_transfer` with `status = 'completed'`, one
`seed_transfer_event`, one received batch, source bag at zero.

### C2. Send versus accept, cancel and opt-out

Precondition for each: A has a pending transfer of bag 4 to B (open request
`R`), made and committed beforehand.

- **C2a send vs accept.** S1: B accepts `R`
  (`fn_respond_transfer_link_request(R, true)`), then `pg_sleep(4)`. S2: A sends
  bag 3 to B. S2 blocks on the pair lock, then runs after the commit, sees the
  new `transfer` link and **completes immediately** (`link_request_created =
  false`, status `completed`). Reverse the order (S1 = send, S2 = accept): the
  send attaches to `R` first; the accept then completes **both** transfers.
- **C2b send vs cancel.** S1: A cancels the pending transfer of bag 4 and
  sleeps. S2: A sends bag 3 to B. If cancel closes `R` (no other transfers on
  it), S2 must open a **new** request (`link_request_created = true`); never
  attach a transfer to the cancelled request.
- **C2c send vs opt-out.** S1: B calls `fn_set_accepts_transfers(false)` and
  sleeps. S2: A sends bag 3. S2 blocks on B's organisation row (the opt-out holds
  `FOR NO KEY UPDATE`; the send needs `FOR SHARE`) and then fails with `42501`
  ("not accepting transfers"). Reverse the order: the send commits first and its
  pending transfer is then cancelled by the opt-out, with the reservation
  released.

### C3. Opt-out versus accept

Precondition: pending transfer of bag 4 to B, request `R` open.

S1: B calls `fn_set_accepts_transfers(false)` and sleeps. S2: B calls
`fn_respond_transfer_link_request(R, true)`. Expect S2 returns
`already_resolved = true` (the request was cancelled by the opt-out) or, if S2
won the lock, completes first and the opt-out then finds nothing to cancel.
Never expected: a `completed` transfer **and** a `cancelled` request, or an
accepted link while `accepts_transfers = false` with a completion after the
opt-out committed.

### C4. Storage edit and whole-batch merge or mix versus acceptance

Precondition: bag 3 (stored) and bag 5 pending to B (reserved) with request `R`.

- **C4a storage edit vs accept.** A reserved bag's storage cannot be edited
  at all (it fails at once with `55000`), so the interesting interleaving is the
  one around the moment of completion. S1: B accepts `R` (completion locks bag 3
  first, then closes its storage row) and sleeps. S2: A calls
  `fn_update_batch_storage_record('ccb60000-0000-0000-0000-000000000003', null, 'edit')`.
  S2 takes the bag lock first, so it waits for S1; after S1 commits the bag is
  no longer A's, so S2 fails (`42501`, "not the current holder", or `55000` if it
  slipped in before the reservation was released). Reverse it: S1 = the storage
  RPC on an **unreserved** stored bag, sleeping; S2 = A sends that bag to B. The
  send waits on the bag lock, then closes the edited storage row. In both
  orders: no open storage row on the moved bag afterwards (invariant 6) and no
  edit applied after the transfer completed.
- **C4b whole-batch merge or mix vs accept.** S1: B accepts `R` (bags of batch
  5 are reserved and then completed) and sleeps. S2: A calls
  `fn_merge_batches(array[batch5, batch6])` (then repeat with
  `fn_mix_batches`). S2 waits on the bag locks taken by
  `fn_lock_batch_bags_for_consumption`; after the commit batch 5's bag is at
  zero, so S2 fails with "All source batches must be active" (or `55000` if it
  ran first against the still-reserved bag). Reverse the order (merge first,
  accept second): the merge fails at once with `55000` while the reservation
  stands, so the accept completes. The merge must never consume a batch whose
  bag a completed transfer moved.

## Invariants (run on a third connection after each case, as table owner)

```sql
-- 1. At most one open transfer request per directional pair.
select requesting_org_id, provider_org_id, count(*)
from public.organisation_link_request
where kind = 'transfer' and accepted_at is null and declined_at is null and cancelled_at is null
group by 1, 2 having count(*) > 1;                                  -- expect 0 rows

-- 2. No pending transfer attached to a resolved request.
select ot.id
from public.ownership_transfer ot
join public.organisation_link_request r on r.id = ot.link_request_id
where ot.status = 'pending_link'
  and (r.accepted_at is not null or r.declined_at is not null or r.cancelled_at is not null);  -- 0 rows

-- 3. No orphaned reservation: every reservation belongs to a pending transfer.
select r.sub_batch_id
from public.sub_batch_reservation r
join public.ownership_transfer ot on ot.id = r.transfer_id
where ot.status <> 'pending_link';                                  -- 0 rows
-- and every pending transfer item is reserved:
select oti.sub_batch_id
from public.ownership_transfer_item oti
join public.ownership_transfer ot on ot.id = oti.transfer_id
where ot.status = 'pending_link'
  and not exists (select 1 from public.sub_batch_reservation r where r.sub_batch_id = oti.sub_batch_id);  -- 0 rows

-- 4. Weight is conserved: for every completed item the source went down by the
--    moved weight and the received bag holds it.
select oti.id
from public.ownership_transfer_item oti
join public.ownership_transfer ot on ot.id = oti.transfer_id and ot.status = 'completed'
join public.sub_batches rb on rb.id = oti.received_sub_batch_id
where rb.weight_grams <> oti.weight_grams
   or (select coalesce(sum(wa.weight_grams), 0) from public.batch_weight_adjustments wa
       where wa.sub_batch_id = oti.sub_batch_id and wa.kind = 'transfer_out') <> -oti.weight_grams;  -- 0 rows

-- 5. One completion per request key: one event, one item mapping, one received batch.
select ot.sender_org_id, ot.request_id, count(*)
from public.ownership_transfer ot group by 1, 2 having count(*) > 1;   -- 0 rows
select count(*) from public.ownership_transfer where status = 'completed' and transfer_event_id is null;  -- 0
select seed_transfer_item_id, count(*) from public.ownership_transfer_item
where seed_transfer_item_id is not null group by 1 having count(*) > 1;  -- 0 rows

-- 6. A completed transfer left no open storage row on a moved bag.
select bs.id
from public.batch_storage bs
join public.ownership_transfer_item oti on oti.sub_batch_id = bs.sub_batch_id
join public.ownership_transfer ot on ot.id = oti.transfer_id and ot.status = 'completed'
where bs.moved_out_at is null;                                      -- 0 rows

-- 7. Total seed is unchanged across the pair (sum of current weights of all
--    CC bags equals the seeded total of 800 g, minus nothing: transfers move
--    weight, they do not destroy it).
select (select coalesce(sum(w.current_weight), 0) from public.sub_batch_current_weight w
        join public.sub_batches sb on sb.id = w.id
        where sb.notes like 'CC bag %' or sb.notes like 'Received by ownership transfer')
       as total_weight;                                             -- expect 800 (plus any split rounding: none)
```

## Run log

| Case | Ran | Result | Notes |
| --- | --- | --- | --- |
| C1a one sender, two requests | not run | | |
| C1b two senders | not run | | |
| C1c duplicate send, one completion | not run | | |
| C2a send vs accept (both orders) | not run | | |
| C2b send vs cancel | not run | | |
| C2c send vs opt-out (both orders) | not run | | |
| C3 opt-out vs accept | not run | | |
| C4a storage edit vs accept | not run | | |
| C4b whole-batch merge / mix vs accept | not run | | |
