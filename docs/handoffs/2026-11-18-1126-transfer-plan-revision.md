# Handoff: transfer plan revised after review

## Goal

Get the implementation plan for the seed-bag ownership **Transfer** feature ready
to build. The plan is `docs/plans/2026-11-18-transfer.md`. An independent review
(`docs/handoffs/2026-11-18-transfer-plan-review.md`) raised findings, and the
user asked for the plan to be updated to address them.

## Status

- **Done:** every review finding was checked against the code, and all of them
  held up. The plan was rewritten to address them, with a "Review changes"
  table at the end mapping each finding to a plan section.
- **Done:** the one open product question was settled. The user chose
  **capture test results at transfer completion** (snapshot), not live reads.
  This is now Resolved question 9 in the plan.
- **Not started:** implementation (migrations, SQL functions, SQL tests, edge
  functions, web UI).
- **Nothing committed.** `docs/plans/` and the handoff files are untracked on
  branch `feat/mobile-indexeddb-query-cache`. That branch is for unrelated
  mobile IndexedDB work, so Transfer implementation should go on a new branch
  cut from `main`.

## Decisions

Original decisions (approved 2026-11-18) are in the plan's decisions table and
resolved questions. Changes made in this session:

- **Two migrations.** Migration A adds enums only (`ALTER TYPE … ADD VALUE`
  values can't be used until the transaction commits). Migration B holds
  everything else.
- **Ledger checks extended:** `batch_weight_adjustment_reference_shape`
  (`transfer_out`), `seed_transfer_event_reference_shape`
  (`ownership_transfer`, currently rejected), and `validate_sub_batch_lineage_edge`
  (allows a cross-owner edge only for a verified `transfer` mapping; keeps the
  existing checks for split, merge and cleaning).
- **Reservations:** a `sub_batch_reservation` table keyed by `sub_batch_id`
  replaces the planned partial index, because an index predicate can't read the
  parent transfer's status. Only one open request is allowed per directional
  pair and kind (a partial unique index). Send, respond and cancel all take a
  `pg_advisory_xact_lock` on the pair, lock bags then batches in id order, and
  re-check state under the locks.
- **Completion:** `fn_complete_ownership_transfer` deletes the reservation
  first, so it needs no guard exemption. It uses a new internal
  `fn_close_storage_for_transfer`, not `fn_set_sub_batch_storage`, which
  requires the caller to hold the bag and raises on an unstored bag. It sets
  the transaction-local `nasti.transfer_completion` (the precedent is
  `nasti.bypass_permission_check`).
- **Reservation guards** fire on INSERT **and UPDATE**, covering
  `batch_storage` updates (storage removal is UPDATE-only) and `sub_batches`
  updates.
- **Link isolation in SQL:** insert, update and delete policies on both link
  tables are restricted to `kind = 'testing'` in both `USING` and `WITH CHECK`.
  The validate triggers widen to `UPDATE OF provider_org_id, requesting_org_id,
  kind`. The `organisation_select` link clause is scoped to testing links. The
  internal functions are revoked from `PUBLIC`, `anon` and `authenticated`.
- **Provenance:** a trigger makes `batches.received_transfer_item_id` and
  `source_collection_code` immutable to clients. The read RPCs authorise every
  hop against a completed `ownership_transfer_item`. Results are projected to
  named fields only, so quality `notes` never leak. Ranking filters
  `deleted_at IS NULL`, partitions quality tests by `result->>'test_type'`,
  and orders by `tested_at DESC NULLS LAST, id DESC`.
- **Test snapshot:** `ownership_transfer_test_snapshot`, filled at completion
  (2.4 step 9). Onward hops copy the upstream snapshots with `hop + 1`.
- **Batch code:** `batches.code` has no uniqueness constraint, so received
  batches reuse the source collection code with no suffix.
- **Web additions:** an "Owned" inventory view for testing orgs (today
  `BatchFiltersContext.tsx` shows them only assigned bags), and removing
  `tests!inner` from `useBatchDetail` (`apps/web/src/hooks/useBatches.ts:193`).
- **Out of scope:** removing a transfer link (needs its own RPC later) and
  storage conditions.

## Files

- `docs/plans/2026-11-18-transfer.md`: the revised plan and the source of truth.
- `docs/handoffs/2026-11-18-transfer-plan-review.md`: the review it answers.
- `docs/handoffs/2026-11-18-0827-transfer-feature-plan.md`: the original feature
  handoff, for background.
- `supabase/migrations/20260911000001_inventory_foundation.sql`: table
  definitions and constraints (weight shape around line 668, event shape
  around line 788).
- `supabase/migrations/20260911000003_inventory_operations_and_lineage.sql`:
  `fn_set_sub_batch_storage` (around line 1485), `validate_seed_transfer_item`
  (around line 2384), `validate_sub_batch_lineage_edge` (around line 2406).
- `supabase/migrations/20260911000004_testing_work_and_custody.sql`:
  `fn_assign_bags_for_testing`, the template (line 149, lock order around
  line 309).
- `supabase/migrations/20260911000005_permissions_rls_and_integrations.sql`:
  batches grants (around line 890), `batch_storage_update` policy (around line
  1594), `batches_update` (around line 1721), organisation and link RLS
  (around lines 2008–2060), triggers (around line 2619), function revokes
  (around line 2713).

## Verification

Nothing has been implemented, so nothing has been run. Once work starts, run:

```bash
pnpm --filter=@nasti/web exec vitest run
```

```bash
pnpm --filter=@nasti/web exec tsc -b
```

```bash
pnpm test:db
```

Run `pnpm test:db` only after the user has applied the migrations.

## Next steps

1. Create a branch from `main` for Transfer, then write Migration A in
   `supabase/migrations/` (the four enum changes in plan §1.1).
2. Write Migration B, link isolation first (§1.4), then check that the existing
   testing code filters `kind = 'testing'`.
3. Write the rest of Migration B (§1.2, 1.3, 1.5–1.7, section 2) and
   `supabase/tests/ownership_transfer.sql` (section 5).
4. Write the edge functions (section 3), then the web UI (section 4), in the
   order given in §6.

## Standing instructions

- Don't apply DB changes: no `supabase db reset`, push, or psql, and no type
  regeneration. Write migrations only; the user applies them and regenerates
  types. Hand-edit `packages/common/types/database.ts` only if the code won't
  compile otherwise, and say so.
- Don't run `prettier --write` on TanStack route files while `pnpm dev` is
  running; the router plugin can replace them with a scaffold stub.
- Code style: `Boolean(x)` not `!!x`, no semicolons, avoid `any`, prefer
  `const`, Tailwind only.
