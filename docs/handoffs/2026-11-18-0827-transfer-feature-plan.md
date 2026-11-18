# Handoff: Transfer feature (plan approved, implementation not started)

## Goal

Build **Transfer**: an organisation can permanently send seed bags, or a
weighed portion of a bag, to another organisation, and ownership moves with
them. It is a generalised form of send-for-testing. The recipient sees only
the species, the collection code, the latest test result per type with quality
stats, and storage dates. Product notes ask that the link "request" and the
"send" can be done in one workflow while the sender picks seeds.

## Status

- **Done:** design Q&A with the user, all decisions confirmed. The
  implementation plan is written and approved at
  `docs/plans/2026-11-18-transfer.md`, with status "approved" and open
  questions resolved.
- **Not started:** all implementation. No migration, functions, edge functions
  or UI exist.
- **Uncommitted:** `docs/plans/` (untracked). The plan was written while on
  `fix/ios-location-offline`, but the checkout is now on
  `feat/mobile-indexeddb-query-cache`, which tracks origin. Someone switched
  branches since. The plan file is untracked, so it moved with the switch.
- **Last proposal to the user, not yet answered:** create a `feat/transfer`
  branch off `main`, move the plan there, then start plan step 1. Don't commit
  or branch without the user's go-ahead.

## Decisions

All are recorded in the plan's decisions table and in memory
(`project_transfer_feature_decisions.md`).

- **Recipient side:** a **new batch** in the recipient org with
  `collection_id` NULL, `species_id` set, `code` = source collection code, and
  provenance through `batches.received_transfer_item_id`. Ruled out:
  re-owning the bag under the sender's batch, because it mixes orgs within one
  batch.
- **Discovery:** an **opt-in directory**, `organisation.accepts_transfers`.
  Any org type can opt in, Testing orgs included, and only Admins can toggle
  it. Ruled out: listing every org, and reusing testing links only.
- **Link:**
  - The first transfer to an org creates a link request, which the
    recipient's **Admins** accept.
  - Once linked, transfers are **immediate**, with no per-transfer accept.
  - Links are directional.
  - Link tables are generalised with `kind` (`testing` | `transfer`).
- **While a link is pending:** bags are **reserved and locked**. They move on
  accept and are released on decline or sender cancel. A split portion stays
  its own bag after cancel.
- **Quantity:** a whole bag, or a partial weight split off first, as testing
  does.
- **Tests shown:** the **latest per test type**, credited to the **performing
  lab**. Scope is the source batch's tests (tests are batch-level today, see
  `useBatchTests`), following earlier transfers back. Cleaning already starts
  a new batch, so pre-cleaning tests drop out.
- **Storage shown:** dates and durations only, with no location names. Storage
  conditions (temperature, RH) don't exist in the schema and are deferred to a
  future feature.
- **Sender keeps:** a history record only.
- **Who can send:** members with the `inventory` permission. Admin-only is
  ruled out.
- **Excluded:** bags out for testing. Uncleaned and previously received bags
  are allowed, so onward transfer works.
- **Recipient species:** match on `ala_guid`, then on case-insensitive name,
  otherwise create a species in the recipient org. This is needed because
  `species` is org-scoped.
- **Notifications:** in-app, plus email to recipient Admins through Mailgun,
  reusing the pattern at `supabase/functions/create_link_request/index.ts:190`.
- **Scope:** web only (`apps/web`). Mobile is untouched.

## Standing instructions

- **Database:** don't apply DB changes. No `supabase db reset`, push, `psql`,
  or type regeneration. Write migrations only; the user reviews and applies
  them.
- **Route files:** don't run `prettier --write` on TanStack route files while
  `pnpm dev` is running, because they can be clobbered into a scaffold stub.
- **Code style** (CLAUDE.md):
  - `Boolean(x)`, never `!!x`;
  - no semicolons;
  - avoid `any`;
  - read "You Might Not Need an Effect" before adding a `useEffect`.
- **Migrations:** forward-only. Never edit historical migrations.

## Files

- `docs/plans/2026-11-18-transfer.md`: the approved plan. Sections 1–6 are
  schema, functions, edge functions, UI, tests and work order.
- `supabase/migrations/20260911000004_testing_work_and_custody.sql:149`:
  `fn_assign_bags_for_testing`, the template for validation, lock order,
  split, ledger write and error codes.
- `supabase/migrations/20260911000001_inventory_foundation.sql`: the enums
  (`seed_transfer_event_kind`, `batch_weight_adjustment_kind`,
  `sub_batch_lineage_operation_kind`), the `organisation_link*` and
  `seed_transfer_*` tables, and `sub_batches.held_by_org_id`.
- `supabase/migrations/20260911000005_permissions_rls_and_integrations.sql`:
  the RLS policies (`species_select` ~2254, `tests_select` ~2435,
  `seed_transfer_*_select` ~2224), plus `validate_testing_provider_link` and
  `is_linked_testing_provider`.
- `supabase/migrations/20260930000002_combined_batch_species_and_cleaning.sql`:
  the `batches.species_id` precedent for batches without a collection.
- `supabase/migrations/20261009000002_testing_org_test_history.sql` and
  `20261009000003_testing_held_bag_tests.sql`: SECURITY DEFINER
  cross-org read patterns.
- `supabase/functions/assign_batches_for_testing/index.ts`: the thin-wrapper
  pattern and its `STATUS_BY_PG_CODE` map.
- `supabase/functions/create_link_request/index.ts`: Mailgun email, currently
  Admin-only and testing-only.
- `supabase/tests/seed_transfer_foundation.sql`: put the new
  `ownership_transfer.sql` beside it.
- `apps/web/src/routes/_private/inventory/-components/send-for-testing.tsx`,
  `store/bagBasketStore.ts` and `lib/sendingWeight.ts`: the UI template.
- `apps/web/src/hooks/useTestingOrgs.ts` and `components/testing-orgs/*`:
  the link UI. These need a `kind = 'testing'` filter.
- `apps/web/src/components/inventory/BatchHistory/index.tsx`: add the
  transfer event here.

## Verification

Nothing is implemented yet. Once step 1 exists, the SQL tests in
`supabase/tests/` run against the user's local Supabase. Ask the user how they
run them, since the session must not reset or apply the DB. `pnpm lint` and
`pnpm build` cover the TypeScript.

## Next steps

1. With the user's OK, create `feat/transfer` from `main` and carry
   `docs/plans/2026-11-18-transfer.md` onto it.
2. Write the plan's §1 schema migration (a new timestamped file after
   `20261013000001_delete_quality_test.sql`, but check `ls supabase/migrations`
   for anything newer first). Include the §2 functions and the §2.7
   reservation trigger.
3. Before writing the code, check two things the plan flags:
   - whether `batches.code` is unique per org;
   - how quality-test subtypes are keyed for "latest per type".
4. Write `supabase/tests/ownership_transfer.sql` (§5).
5. Update the testing code paths to filter `kind = 'testing'` (§1.3 list).
6. Write the edge functions `send_bags_for_transfer` and
   `respond_transfer_link_request` (§3).
7. Build the web UI (§4) in the plan's order.

## Open questions

- Should the user's chosen branch be `feat/transfer` off `main`? They haven't
  answered yet.
- How does the user run `supabase/tests/*.sql` locally?
