# Handoff: Testing organisations split and merge assigned bags

## Goal
User's request: "Testing organisations also must be able to split and merge seed bags sent to them for testing. Currently these functions are hidden from the UI. Add the split and merge buttons to the UI (in the actions column in the inventory table) and ensure the backend functions will work properly."

## Status
- Done (code written, not applied or run against a DB):
  - New migration `supabase/migrations/20261008000001_testing_lab_split_merge.sql`.
  - New pgTAP test `supabase/tests/testing_lab_split_merge.sql` (plan 24).
  - Edge function `supabase/functions/return_batch_from_testing/index.ts` accepts `sub_batch_id`.
  - Web UI: Split and Merge buttons in the Testing inventory Actions column, merge pick-mode, per-bag inventory rows and per-bag Return.
  - `database.ts` hand-edited for the two new RPCs.
- Verified: `cd apps/web && npx tsc --noEmit -p .` is clean, eslint is clean on the changed files, and `npx vitest run src/lib` shows 52 passing. Prettier was applied to the two inventory files.
- Not done:
  - The migration has not been applied.
  - The pgTAP tests have not been run.
  - The edge function has not been deployed.
  - Nothing has been checked in a browser.
  - Nothing is committed.

## Decisions
- **Model chosen by the user: "Bag rows, close when empty"** (over "Bag rows, retained stays").
  - The lab inventory is one row per bag the lab holds (`held_by_org_id` = lab, weight > 0), linked to its open assignment(s) through `sub_batch_lineage`.
  - An assignment closes (`closed_at` + `outcome` of `returned`/`consumed`) only once the lab holds no positive-weight seed descended from the assignment's bag.
  - A retained subsample keeps its assignment open, so the owner sees "Bags out", until it is returned or consumed.
- **New SQL**, all SECURITY DEFINER with `search_path ''`:
  - `fn_testing_assignment_has_held_seed(uuid)` (internal; EXECUTE revoked) walks descendants.
  - `fn_close_spent_testing_assignments(uuid[], text)` (internal) closes the open assignments that no longer have held seed.
  - `fn_testing_held_bags()` returns `(sub_batch_id, assignment_id)` for the caller org. Granted to authenticated.
  - `fn_return_held_bag_from_testing(uuid)` handles a per-bag return. It is Admin only and the bag must be held by the caller with an open resolved assignment. It closes storage, sets `held_by` back to the batch owner, and nulls `container_id` unless the container is an owner's active storage container. It then closes spent assignments as `returned`. Granted to authenticated.
  - Replaced `fn_create_quality_test_without_adjustment_classification`. It completes and locks every open assignment the bag resolves to via `fn_resolve_testing_assignments_for_sub_batch`, filtered to `assigned_to_org_id` = caller. It closes spent assignments as `consumed` when the test consumes weight.
  - Replaced `fn_create_quality_test`. Work closure now additionally requires `NOT fn_testing_assignment_has_held_seed`.
- `fn_split_sub_batch` and `fn_merge_sub_batches` were left unchanged. They already gate on the bag custodian, keep the holder, and write lineage. Merge requires a container of the caller's org (the lab).
- The old `fn_return_bag_from_testing(assignment_id)` was kept. Its pgTAP tests still use it, and the edge function falls back to it when only `assignment_id` is sent, for older clients. It has the old semantics: it returns only the sent bag and closes the assignment.
- UI:
  - `BatchSplitForm` and `BatchSplitModal` props were loosened to `Pick<BatchWithCurrentLocationAndSpecies, "id" | "code">`, so the Testing row passes `bag.parent`.
  - Merge reuses `SubBatchMergeModal` via a small `TestingMergeModal` wrapper in `testing.tsx`, which loads full records with `useSubBatches(batchId)`.
  - `useSplitSubBatch` and `useMergeSubBatches` now also invalidate `["assignments"]`.

## Files
- `supabase/migrations/20261008000001_testing_lab_split_merge.sql`: all backend changes.
- `supabase/tests/testing_lab_split_merge.sql`: pgTAP coverage for split → merge → test → return → consume-via-child.
- `supabase/functions/return_batch_from_testing/index.ts`: `sub_batch_id` path plus legacy `assignment_id` path.
- `apps/web/src/hooks/useTestingOrgAssignments.ts`:
  - `AssignedBag` now has `assignments[]`.
  - New helpers `getAssignedBagSender`, `getAssignedBagAssignedAt` and `isAssignedBagTested`.
  - The query is built from `fn_testing_held_bags`.
  - `useReturnBagFromTesting({ subBatchId })`.
- `apps/web/src/routes/_private/inventory/-components/BatchTableRow/Testing.tsx`: the row with Test, Split, Merge and Return actions, plus `BagMergeMode`.
- `apps/web/src/routes/_private/inventory/-components/testing.tsx`: merge selection state, the "Merge (n)"/Cancel bar, and `TestingMergeModal`.
- `apps/web/src/components/tests/ReturnBatchModal.tsx`: per-bag return and updated copy.
- `apps/web/src/hooks/useSubBatches.ts`, `apps/web/src/components/batches/BatchSplitForm.tsx`, `apps/web/src/components/inventory/modals/BatchSplitModal.tsx`: the smaller changes described above.
- `packages/common/types/database.ts`: hand-added `fn_return_held_bag_from_testing` and `fn_testing_held_bags`.
- Unrelated uncommitted work in the tree:
  - `CollectionDetailModal.tsx`, `ScoutingNoteDetailModal.tsx`, `components/common/AudioTab.tsx`, `hooks/useEntityAudio.ts`.
  - The prior Owner-column work (see `docs/handoffs/2026-10-07-1455-testing-inventory-owner-column.md`), which lives in the same two inventory files.

## Verification
- `cd apps/web && npx tsc --noEmit -p .`: passed.
- `cd apps/web && npx vitest run src/lib`: 5 files and 52 tests passed.
- `supabase test db`: not run. It needs the user to apply the migration first. It should also be checked that the existing `supabase/tests/sub_batch_testing_assignments.sql` (plan 141) still passes against the replaced quality-test functions.
- Manual check, not yet done. As a Testing-org Admin with assigned bags on `/inventory`:
  1. Split a bag and confirm the child row appears.
  2. Merge two bags of the same batch and confirm the merged row lists both owners' assignments.
  3. Test the merged bag.
  4. Return each bag and confirm the rows disappear and assignments close.

## Next steps
1. Have the user review and apply `20261008000001_testing_lab_split_merge.sql`, then run `supabase test db` and fix any failures in `testing_lab_split_merge.sql` or `sub_batch_testing_assignments.sql`.
2. Deploy the `return_batch_from_testing` edge function.
3. Run the web app (`pnpm dev --filter=@nasti/web`) and do the manual check above.
4. Commit only the files for this feature, keeping the unrelated modal/audio work out. The Owner-column work shares files with this change, so decide with the user whether to commit the two together.

## Open questions
- Should the legacy `fn_return_bag_from_testing` and the edge function's `assignment_id` path be removed once no client uses them? Their semantics (close on return even if the lab still holds seed) conflict with the new model.
- Testing-org Members have no `inventory` permission by default, so they get "Your account does not have inventory access" on split/merge. This is the known deferred item; should the buttons be hidden for them?

## Standing instructions
- Do not apply DB changes: no `supabase db reset`/`push`/`psql`, and no `pnpm gen-types`. Hand-edit `database.ts`. The user applies migrations.
- Use `Boolean(x)`, not `!!x`. No semicolons. Avoid `any`.
- Don't run `prettier --write` on route files while a nasti `pnpm dev` is running.
- Commit only when asked.
