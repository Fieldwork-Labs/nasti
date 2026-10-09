# Handoff: Testing org container fixes and viewing/editing test results

## Goal
Branch `feat/testing-work-custody-migrations-cleanup`. Three requests from the user, in order:
1. Fix `Invalid or inactive storage container <id>` when a Testing-org user splits a bag.
2. Let merge work without a destination container (a lab with no containers of its own was blocked).
3. Let a Testing org view its previous test results and edit them: first as a list, then inline on each inventory row.

## Status
- Done and committed (`73daa97`, "fix: scope container pickers to own org and make merge container optional"):
  - `useContainers` in `apps/web/src/hooks/useContainers.ts` now filters by `organisation_id` of the current user.
  - `supabase/migrations/20261009000001_optional_merge_container.sql` makes the merge container optional.
  - `SubBatchMergeModal.tsx` has a "No container" option, `useMergeSubBatches` sends `p_container_id` only when set, and `database.ts` types it as optional.
  - `supabase/tests/sub_batch_merge.sql` has two new assertions (plan 31).
- Done, **uncommitted**, typecheck and eslint clean, nothing applied or run:
  - **Test results tab.** New `fn_testing_test_history()` in `supabase/migrations/20261009000002_testing_org_test_history.sql`. New `apps/web/src/hooks/useTestingTestHistory.ts` and `apps/web/src/routes/_private/inventory/-components/TestingTestHistory.tsx`. `testing.tsx` now has "Bags" and "Test results" tabs.
  - **Inline results per bag row.** New `fn_testing_held_bag_tests()` in `supabase/migrations/20261009000003_testing_held_bag_tests.sql`. `useBagTestResults(subBatchId)` in the same hook file. `BatchTableRow/Testing.tsx` has a clipboard toggle with a count, an expandable sub-row (date, type, `QualityTestStats`, edit pencil) and an edit `QualityTestModal`.
  - `useBatchTests.ts` (create and update) and `useSubBatches.ts` (split and merge) invalidate `TESTING_TEST_HISTORY_KEY`.
  - `database.ts` hand-edited for `fn_testing_test_history` and `fn_testing_held_bag_tests`.
  - `supabase/tests/testing_test_history.sql` (plan 11).
- Not done: migrations not applied, pgTAP not run, nothing checked in a browser.

## Decisions
- Container root cause: the `containers_select` RLS policy lets a Testing org read containers that hold bags it can read, so the sender's container appeared in the picker, but the split/merge RPCs require `container.organisation_id = get_user_organisation_id()`. Fixed in the hook only; bag and collection container names come from embedded joins, so they still show the sender's containers. The `apps/mobile` `useContainers` was left alone (collectors, own org).
- Merge container is optional, matching split and the nullable `sub_batches.container_id`. A supplied container is still validated. New migration rather than editing the baseline; `p_container_id` got `DEFAULT NULL` so generated types are optional.
- Past-test context needs a `SECURITY DEFINER` function because `can_read_batch` is owner OR `holds_any_bag_of_batch`, and that second check ignores weight. A lab that uses a bag up still reads the batch; one that **returns** the bag no longer does, so a plain `batches` join would be empty.
- Inline results include tests from ancestor bags (via `sub_batch_lineage`), so a split child or merged bag shows its parents' tests, with a "Tested before this bag was split or merged" badge.
- Edit reuses `QualityTestModal`/`QualityTestForm` and `useUpdateQualityTest`; RLS `tests_update` already allows own-org edits.
- Committed only this session's hunks, staging `database.ts` and `useSubBatches.ts` partially, because the tree holds earlier unrelated work.
- Left alone on purpose: the same "Add an active storage container type…" message in `CleaningBaggingForm.tsx` (user said leave it).

## Dead ends
- The migration comment first claimed a lab "can no longer read the batch" after a consumed bag. Wrong, see above. The pgTAP test now tests then returns the bag.
- macOS `sed -i` needs `-i ''`. Use python for in-place edits.

## Files
- `apps/web/src/hooks/useContainers.ts`: org-filtered container list (committed).
- `supabase/migrations/20261009000001_optional_merge_container.sql`: optional merge container (committed).
- `supabase/migrations/20261009000002_testing_org_test_history.sql`: `fn_testing_test_history()`, tests plus batch code, species, collection, owner name.
- `supabase/migrations/20261009000003_testing_held_bag_tests.sql`: `fn_testing_held_bag_tests()`, held bag to test ids through lineage.
- `apps/web/src/hooks/useTestingTestHistory.ts`: `useTestingTestHistory`, `useBagTestResults`, `TESTING_TEST_HISTORY_KEY`.
- `apps/web/src/routes/_private/inventory/-components/TestingTestHistory.tsx`: the Test results tab table.
- `apps/web/src/routes/_private/inventory/-components/testing.tsx`: tabs wrapper.
- `apps/web/src/routes/_private/inventory/-components/BatchTableRow/Testing.tsx`: inline toggle, sub-row, edit modal.
- `supabase/tests/testing_test_history.sql`: pgTAP for the two functions. It calls `fn_return_held_bag_from_testing`, which lives in the unapplied `20261008000001_testing_lab_split_merge.sql`.
- Unrelated uncommitted work still in the tree: `CollectionDetailModal.tsx`, `ScoutingNoteDetailModal.tsx`, `AudioTab.tsx`, `useEntityAudio.ts`, and the testing-lab split/merge feature (`20261008000001_*.sql`, `testing_lab_split_merge.sql`, `return_batch_from_testing/index.ts`, `ReturnBatchModal.tsx`, `useTestingOrgAssignments.ts`, `BatchSplitForm.tsx`, `BatchSplitModal.tsx`). See `docs/handoffs/2026-10-08-1614-testing-lab-split-merge.md`.

## Verification
- `pnpm --filter @nasti/web exec tsc --noEmit -p .`: clean at last run.
- `pnpm exec eslint --max-warnings 0 <changed files>`: clean at last run.
- `supabase test db`: not run. Needs the user to apply `20261009000001`, `20261008000001`, `20261009000002`, `20261009000003` first. Then check `testing_test_history.sql`, `sub_batch_merge.sql` and the existing `sub_batch_testing_assignments.sql`.
- Manual, as a Testing-org Admin: open Testing inventory, tick Test results tab, edit a test; tested bag row shows the clipboard toggle and sub-row; split a tested bag and see the child carry the parent's results; merge two bags with no container.

## Next steps
1. User applies the migrations in order, runs `supabase test db`, fixes any failures in the new tests.
2. Run `pnpm dev --filter=@nasti/web` and do the manual checks above. Do not run `pnpm dev` while reformatting route files (see memory: route files can be clobbered).
3. Decide with the user what to commit together. This feature's files overlap with the uncommitted split/merge feature in `Testing.tsx`, `testing.tsx` and `useSubBatches.ts`.

## Open questions
- `useUpdateQualityTest` overwrites `tested_at` with now() on every edit (owners too). Should edits keep the original test date? I would remove it.
- Editing a result does not change the weight deducted when the test was created, for owners or labs. If a lab corrects a repeat's `weight_grams`, the bag weight is off. Should edits create a compensating adjustment?
- Should the `CleaningBaggingForm` container requirement also be relaxed?
- Testing-org Members need the `inventory` permission to edit tests (and split/merge); known deferred item, buttons are not hidden for them.

## Standing instructions
- Do not apply DB changes: no `supabase db reset`/`push`/`psql`, no `pnpm gen-types`; hand-edit `packages/common/types/database.ts`. The user applies migrations.
- Use `Boolean(x)`, not `!!x`. No semicolons. Avoid `any`. Tailwind only.
- Commit only on request, and only this session's hunks when the tree has unrelated work. End commits with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Pre-commit hook runs prettier and eslint via lint-staged.
