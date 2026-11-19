# Handoff: transfer plan gap fill (third pass)

## Goal

Make sure the implementation plan for the seed-bag ownership **Transfer** feature
(`docs/plans/2026-11-18-transfer.md`) covers every stage and decision before
implementation starts. Three documents feed it:

- the first review, `docs/handoffs/2026-11-18-transfer-plan-review.md`;
- the second-review implementation handoff,
  `docs/handoffs/2026-11-18-1215-transfer-implementation.md`, whose defaults
  the user confirmed;
- the original feature handoff, `docs/handoffs/2026-11-18-0827-transfer-feature-plan.md`.

## Status

- **Done:** the first review's findings were addressed in the plan earlier
  today (two migrations, reservation table, pair lock, testing-only link RLS,
  internal storage close, guarded provenance columns, captured test snapshot).
- **Done:** the user, or another session, added the second-review decisions to
  the plan: opt-out (§2.9), request-ID replay (§2.3), storage snapshot,
  cross-hop test ranking, whole-batch merge and mix guards (§2.8), and cleaning
  received bags (§2.10).
- **Done (this pass):** checked the plan against both review documents and the
  code, then filled the gaps (see Decisions). Each change is listed under
  "Third pass" rows in the plan's "Review changes" table.
- **Waiting on the user:** confirming that received batches can't be mixed or
  combined in v1 (Resolved question 14 is marked "pending the user's
  confirmation").
- **Not started:** any implementation.
- **Nothing committed.** The plan and handoffs are untracked on
  `feat/mobile-indexeddb-query-cache`, which is unrelated mobile work.

## Decisions

Added in this pass, with the code fact behind each:

- **Cleaning received batches.** The web only calls `fn_clean_batch`
  (`apps/web/src/hooks/useCleanBatch.ts`). It handles collectionless batches
  (`20260930000002_combined_batch_species_and_cleaning.sql:222`), but raises
  "Cannot clean a batch that already has sub-batches. Use fn_clean_sub_batch
  instead." A received batch always has one bag. The bag-level
  `fn_clean_sub_batch_without_lineage` (`20260911000003_…`) raises "Parent
  batch has no collection". The plan's fix (§2.10):
  - give the bag-level function `fn_clean_batch`'s collectionless branch (base
    code = batch `code`, species = batch `species_id`, numbering scoped to the
    org's collectionless batches);
  - copy `source_collection_code` onto the outputs, and do the same in
    `fn_clean_batch`;
  - on the web, add a `useCleanSubBatch` hook and route the form to it when
    the batch has bags.
- **Mix and combine are not in v1 for received seed** (default, pending
  confirmation). `fn_mix_batches` and `fn_combine_batches` join `collection`
  to check one IBRA region, so they reject received batches. The UI disables
  both for received batches and their cleaned outputs, with the message
  "Seed received from another organisation can't be mixed or combined yet".
  Also listed under Out of scope.
- **"Active inventory" defined** from `active_sub_batches`
  (`20260911000003_…:2906`): current weight > 0, held by the org, parent not a
  `batch_merges` source, and bag not a `batch_cleaning` input. Send and accept
  use the same rules.
- **`accepts_transfers` guard** (§1.3). `organisation_update` lets an Admin
  update the whole row, so an invoker trigger rejects changes from the
  `authenticated` role. The settings form stops sending the field.
- **Storage edits.** `useUpdateStorageRecord` (`apps/web/src/hooks/useBatchStorage.ts:376`)
  writes `batch_storage` directly. It moves to the bag-first storage RPC (§2.8,
  §4).
- **Missing stages added:**
  - step 0: branch from `main`, carry the untracked docs, check for drift
    since `fbc4e6f`;
  - step 4: a checkpoint where the user applies the migrations and
    regenerates types, then `pnpm test:db` runs before edge or web work;
  - `[functions.send_bags_for_transfer]` and
    `[functions.respond_transfer_link_request]` with `verify_jwt = false` in
    `supabase/config.toml`;
  - hooks `useReceivedBatchStorageHistory`, `useSetAcceptsTransfers` and
    `useCleanSubBatch`;
  - an in-app count of open incoming requests on the Transfer partners nav
    item;
  - no changeset needed, because `.changeset/config.json` ignores
    `@nasti/web` and `@nasti/common`.
- **Earlier decisions stand:** test results captured at completion, Admins
  accept link requests, links are directional, `batches.code` reuses the
  source collection code with no suffix (no uniqueness constraint exists).

## Files

- `docs/plans/2026-11-18-transfer.md`: the implementation spec. §6 is the
  order of work.
- `docs/handoffs/2026-11-18-1215-transfer-implementation.md`: the confirmed
  second-review behaviour and sequence.
- `docs/handoffs/2026-11-18-transfer-plan-review.md`: the first review.
- `supabase/migrations/20260930000002_combined_batch_species_and_cleaning.sql`:
  the latest `fn_clean_batch` and `fn_combine_batches`.
- `supabase/migrations/20260911000003_inventory_operations_and_lineage.sql`:
  `fn_clean_sub_batch_without_lineage`, `fn_mix_batches` (IBRA check around
  line 1393), `fn_set_sub_batch_storage` (around line 1485), the lineage
  validator (around line 2406), and `active_sub_batches` (around line 2906).
- `supabase/migrations/20260911000005_permissions_rls_and_integrations.sql`:
  RLS, grants, triggers and function revokes.
- `apps/web/src/hooks/useCleanBatch.ts`, `useBatchStorage.ts`, `useBatches.ts`
  (`tests!inner` at line 193): web changes.
- `apps/web/src/routes/_private/inventory/-components/BatchFiltersContext.tsx:109`:
  testing orgs see only assigned bags; needs an Owned view.
- `supabase/config.toml`: edge function entries.

## Verification

Nothing is implemented, so nothing has run. When work starts:

```bash
pnpm --filter=@nasti/web exec vitest run
```

```bash
pnpm --filter=@nasti/web exec tsc -b
```

```bash
pnpm test:db
```

Run `pnpm test:db` only after the user applies the migrations. Record which
two-session concurrency cases ran.

## Next steps

1. Get the user's answer on mix and combine (Open questions). If they confirm,
   remove "pending the user's confirmation" from Resolved question 14 in the
   plan.
2. Create a branch from `main` for Transfer and copy the plan and handoffs
   onto it (plan §6 step 0).
3. Write Migration A (enums, plan §1.1) in `supabase/migrations/`.
4. Continue with plan §6 steps 2–3, then stop at the step 4 checkpoint for the
   user to apply the migrations and regenerate types.

## Open questions

- Should received batches stay out of mix and combine in v1? Supporting them
  needs a decision on how the IBRA region travels with a transfer.

## Standing instructions

- Don't apply DB changes: no `supabase db reset`, push, or psql, and no type
  regeneration. Write migrations only; the user applies them and regenerates
  types. Hand-edit `packages/common/types/database.ts` only if code won't
  compile otherwise, and say so.
- Don't run `prettier --write` on TanStack route files while `pnpm dev` is
  running; the router plugin can replace them with a scaffold stub.
- Code style: `Boolean(x)` not `!!x`, no semicolons, avoid `any`, prefer
  `const`, Tailwind only. Read "You Might Not Need an Effect" before writing a
  `useEffect`.
