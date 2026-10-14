# Plan 001: Preserve physical storage semantics when merging sub-batches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report—do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 0a75ec2..HEAD -- \
>   apps/web/src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx \
>   apps/web/src/hooks/useSubBatches.ts \
>   packages/common/types/database.ts \
>   supabase/migrations \
>   supabase/tests
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. If the
> merge behavior or storage schema no longer matches, treat that as a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug, migration, tests
- **Planned at**: commit `0a75ec2`, 2026-07-28

## Why this matters

`fn_merge_sub_batches` currently chooses the first selected sub-batch as the
target, adds all other current weights to it, and deletes the other rows. Now
that sub-batches represent physical storage containers, this can silently
record seed from several containers and locations as being entirely in the
first selected container and location. Deletion also cascades the removed
sub-batches' storage records, weight adjustments, and quality tests.

After this plan, merging will represent the real physical operation: users
select a destination storage-container type and location, the database creates
a new destination sub-batch, source portions are reduced to zero without being
deleted, current source storage records are closed, and historical tests and
storage records remain intact.

## Current state

### Relevant files

- `supabase/migrations/20260728000001_numeric_weights.sql` — contains the
  latest `fn_merge_sub_batches` definition.
- `supabase/migrations/20260723000001_sub_batches_and_cleaning.sql` — defines
  sub-batches, weight adjustments, storage linkage, and cascade behavior.
- `supabase/migrations/20260728000003_cleaning_bagging_storage.sql` — adds
  `sub_batches.container_id` and demonstrates container/location validation.
- `supabase/migrations/20260728000004_split_sub_batch_containers.sql` —
  demonstrates the current atomic RPC convention for container-aware sub-batch
  changes.
- `apps/web/src/hooks/useSubBatches.ts` — calls `fn_merge_sub_batches`.
- `apps/web/src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx`
  — lets users select rows and immediately invokes the merge mutation.
- `apps/web/src/components/batches/CleaningBaggingForm.tsx` — existing
  container/location selector pattern.
- `packages/common/types/database.ts` — generated Supabase types; regenerate
  rather than hand-editing.
- `supabase/tests/rls_contracts.sql` — current pgTAP conventions and seeded JWT
  setup.

### Existing destructive merge behavior

At `supabase/migrations/20260728000001_numeric_weights.sql:911-943`:

```sql
-- Use first sub-batch as the target (keep it, delete the rest)
v_target_sub_batch_id := p_sub_batch_ids[1];

SELECT COALESCE(SUM(sbcw.current_weight), 0)
INTO v_others_weight
FROM sub_batch_current_weight sbcw
WHERE sbcw.id = ANY (p_sub_batch_ids)
  AND sbcw.id != v_target_sub_batch_id;

INSERT INTO batch_weight_adjustments (...)
VALUES (
  v_target_sub_batch_id,
  v_others_weight,
  'Merged in sibling sub-batches',
  auth.uid()
);

DELETE FROM sub_batches
WHERE id = ANY (p_sub_batch_ids)
  AND id != v_target_sub_batch_id;
```

`batch_storage.sub_batch_id`,
`batch_weight_adjustments.sub_batch_id`, and `tests.sub_batch_id` use cascading
foreign keys, so deleting the source sub-batches removes their history.

### Existing UI behavior

At
`apps/web/src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx:44-48`:

```tsx
const handleMerge = async () => {
  if (selectedForMerge.length < 2) return
  await mergeMutation.mutateAsync({ subBatchIds: selectedForMerge })
}
```

There is no confirmation step and no destination container or location.

### Existing validation convention

`supabase/migrations/20260728000004_split_sub_batch_containers.sql:75-103`
validates catalogue references before mutation:

```sql
IF v_container_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM public.containers container
  WHERE container.id = v_container_id
    AND container.organisation_id = v_organisation_id
    AND container.purpose = 'storage'
    AND container.active
) THEN
  RAISE EXCEPTION 'Invalid or inactive storage container %', v_container_id;
END IF;
```

Match this convention for the merge destination.

## Target behavior

The replacement RPC must:

1. Accept distinct source sub-batch IDs, a required destination container ID,
   a required destination location ID, and optional notes.
2. Lock all source sub-batch rows in deterministic UUID order.
3. Verify every requested source exists, all belong to the same batch, all
   have a positive current weight, and the caller is the current custodian.
4. Validate that the destination container belongs to the caller's
   organisation, is active, and has `purpose = 'storage'`.
5. Validate that the destination location belongs to the caller's
   organisation.
6. Capture the total current source weight.
7. Insert a negative adjustment equal to each source's current weight, making
   every source current weight zero without deleting its row.
8. Set `moved_out_at` on every open `batch_storage` row for the sources using
   one shared timestamp.
9. Insert one new sub-batch with the summed weight, destination container, and
   notes identifying it as a sub-batch merge.
10. Insert the new sub-batch's current storage row at the destination location.
11. Return the new sub-batch UUID.
12. Execute atomically; any failed validation or insert must roll back every
    adjustment and storage update.

The operation must preserve:

- Existing source `sub_batches` rows.
- Existing source `batch_storage` history.
- Existing source `tests`.
- Existing source weight-adjustment history.
- Total current batch weight.

The new destination must not inherit a source quality test. Tests remain
historical evidence for the source portions on which they were performed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Start database | `supabase start` | exit 0; local services reported running |
| Apply from scratch | `supabase db reset` | exit 0; all migrations and seed apply |
| Generate types | `pnpm gen-types` | exit 0; `packages/common/types/database.ts` contains the new RPC signature |
| Database tests | `pnpm test:db` | exit 0; all pgTAP assertions pass |
| Web tests | `pnpm --filter=@nasti/web exec vitest run` | exit 0; all tests pass |
| Typecheck | `pnpm --filter=@nasti/web exec tsc -b` | exit 0; no errors |
| Targeted lint | `pnpm --filter=@nasti/web exec eslint src/hooks/useSubBatches.ts src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx src/components/batches/SubBatchMergeModal.tsx` | exit 0; no errors |
| Production build | `pnpm --filter=@nasti/web build` | exit 0 |
| Diff hygiene | `git diff --check` | exit 0; no output |

The web app currently has one small Vitest suite. Do not use root `pnpm lint`
as the only lint gate because generated `.wrangler` output can produce
unrelated lint failures; use the targeted lint command plus the production
build.

## Scope

**In scope**:

- Create
  `supabase/migrations/<next_timestamp>_container_aware_sub_batch_merge.sql`.
- Add merge-specific pgTAP coverage under `supabase/tests/`.
- Regenerate `packages/common/types/database.ts`.
- Update `apps/web/src/hooks/useSubBatches.ts`.
- Create
  `apps/web/src/components/batches/SubBatchMergeModal.tsx`.
- Update
  `apps/web/src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx`.
- Update `apps/web/src/components/batches/index.ts` only if the new modal is
  exported through that barrel.
- Update `plans/README.md` status when complete.

**Out of scope**:

- Bagging recovery or bagging-record editing; that is backlog issue 2.
- General container display in inventory; that is backlog issue 6.
- Changing `containers` from a type catalogue into individually numbered
  physical assets.
- Batch-level `fn_merge_batches`; this plan changes only sibling sub-batch
  merging.
- Changing or deleting historical tests.
- Rewriting unrelated storage-move hooks.
- Mobile or PowerSync changes.

## Git workflow

- Branch: `feat/container-aware-sub-batch-merge`
- Use Conventional Commits. Suggested commit:
  `fix: preserve container storage when merging sub-batches`
- Do not push or open a pull request unless explicitly instructed.

## Steps

### Step 1: Add behavioral database tests that characterize the required merge

Create a dedicated pgTAP file such as
`supabase/tests/sub_batch_merge.sql`. Follow the transaction, JWT, role, and
`finish()` conventions in `supabase/tests/rls_contracts.sql`.

Set up isolated fixture rows as the database owner, then call the RPC as an
authenticated seeded organisation user. Cover:

1. Two source sub-batches in the same batch, each with positive current weight,
   different storage containers, and different open storage locations.
2. At least one source with an existing quality test or another dependent
   historical row.
3. A successful merge into an active storage-purpose container and same-org
   location.
4. Total batch current weight before and after is identical.
5. Both source current weights become zero.
6. Both source rows still exist.
7. Existing source tests still exist.
8. Existing storage rows remain and receive the same non-null `moved_out_at`.
9. Exactly one new active sub-batch exists with the summed weight and selected
   container.
10. Exactly one open storage row exists for the new sub-batch at the selected
    destination.
11. Duplicate source IDs are rejected.
12. A missing source ID mixed with a valid ID is rejected.
13. Sources from different batches are rejected.
14. Another organisation's container or location is rejected.
15. A collection-purpose or inactive container is rejected.

Before adding the replacement migration, the success/history assertions should
fail against the current destructive function. Authorization and malformed
input assertions may already pass.

**Verify**:

```bash
pnpm test:db
```

Expected before Step 2: the newly added positive merge behavior assertions
fail for the documented reasons; all unrelated existing assertions pass.

### Step 2: Replace `fn_merge_sub_batches` with a non-destructive destination RPC

Create the next timestamped migration. Drop the exact old function signature
before creating the new one:

```sql
DROP FUNCTION public.fn_merge_sub_batches(UUID[], TEXT);
```

Create a replacement with an explicit signature equivalent to:

```sql
public.fn_merge_sub_batches(
  p_sub_batch_ids UUID[],
  p_container_id UUID,
  p_location_id UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
```

Implementation requirements:

- Reject null arrays, fewer than two IDs, and duplicates before locking.
- Lock sources using a query ordered by `id` to avoid deadlocks.
- Compare the number of locked/found rows with
  `cardinality(p_sub_batch_ids)`; do not rely only on
  `COUNT(DISTINCT batch_id)`.
- Read current weights after acquiring locks.
- Reject zero or negative source current weights.
- Validate custody and destination tenancy/purpose/activity before any writes.
- Use one `v_merged_at := now()` timestamp for all source storage closures and
  the destination storage row.
- Insert one negative `batch_weight_adjustments` row per source with
  `weight_grams = -current_weight`, a clear merge reason, and
  `created_by = auth.uid()`.
- Close every source storage row where `moved_out_at IS NULL`.
- Insert the new sub-batch at the summed current weight and destination
  container.
- Insert the destination `batch_storage` row.
- Return the new sub-batch ID.
- Use `SECURITY DEFINER SET search_path = public, pg_temp`.
- Revoke execution from `PUBLIC` and grant it only to `authenticated`.
- Add a function comment describing non-destructive source preservation.

Do not delete or update source `sub_batches` rows. Do not move tests from source
rows to the new row.

**Verify**:

```bash
supabase db reset
pnpm test:db
```

Expected: reset exits 0 and every pgTAP assertion, including the new merge
tests, passes.

### Step 3: Regenerate database types and update the merge mutation

Run:

```bash
pnpm gen-types
```

Update `useMergeSubBatches` in `apps/web/src/hooks/useSubBatches.ts` so its
variables include:

```ts
type MergeSubBatchesParams = {
  subBatchIds: string[]
  containerId: string
  locationId: string
  notes?: string
}
```

Map these values to the new RPC argument names. Preserve invalidation of
`["subBatches"]` and `["batches"]`; also invalidate storage-location queries so
current occupancy updates immediately.

Do not cast away a generated RPC signature mismatch. If the generated type does
not contain all four arguments, stop and correct the migration/type generation.

**Verify**:

```bash
pnpm --filter=@nasti/web exec tsc -b
```

Expected: exit 0 with no type errors.

### Step 4: Add a destination modal for sub-batch merges

Create
`apps/web/src/components/batches/SubBatchMergeModal.tsx`. Follow the existing
Radix dialog and selector conventions used by
`CleaningBaggingForm.tsx` and the inventory modals.

Required UI:

- Show the number of selected source sub-batches and their summed current
  weight.
- Require one active storage-purpose container from
  `useActiveContainers("storage")`.
- Require one organisation storage location from `useStorageLocations()`.
- Provide optional notes.
- If all selected sources share a container or location, preselect those values
  only when the referenced container remains active and storage-purpose.
- Disable submission while catalogues load, either catalogue is empty, or the
  mutation is pending.
- Distinguish catalogue query errors from genuinely empty catalogues.
- On success, toast that the sub-batches were merged, close the modal, exit
  merge-selection mode, and rely on mutation invalidation to refresh inventory.
- On failure, keep the modal open and show the actual safe `Error.message`;
  do not discard the selection.
- Cancel must not mutate anything.

The UI must not choose the first source's container implicitly.

**Verify**:

```bash
pnpm --filter=@nasti/web exec eslint \
  src/components/batches/SubBatchMergeModal.tsx
pnpm --filter=@nasti/web exec tsc -b
```

Expected: both commands exit 0.

### Step 5: Replace the immediate merge action with the modal

Update
`apps/web/src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx`:

- Keep the existing selection mode.
- Replace the direct `handleMerge` mutation with state that opens
  `SubBatchMergeModal` once at least two sources are selected.
- Pass the selected `SubBatchWithStorage` rows, not only IDs, so the modal can
  show total weight and choose safe defaults.
- Clear selection and leave merge mode only after successful submission.
- Preserve selection when the modal is cancelled or submission fails.
- Remove unused merge mutation and toast imports from the table component if
  the modal owns them.

If a barrel export is used, add the modal to
`apps/web/src/components/batches/index.ts`; otherwise use the repo's prevailing
direct-import convention.

**Verify**:

```bash
pnpm --filter=@nasti/web exec eslint \
  src/hooks/useSubBatches.ts \
  src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx \
  src/components/batches/SubBatchMergeModal.tsx
pnpm --filter=@nasti/web exec tsc -b
```

Expected: exit 0 with no lint or type errors.

### Step 6: Run the complete verification gates

Run:

```bash
pnpm test:db
pnpm --filter=@nasti/web exec vitest run
pnpm --filter=@nasti/web build
git diff --check
git status --short
```

Expected:

- All pgTAP tests pass.
- All web Vitest tests pass.
- The web production build exits 0.
- `git diff --check` emits no output.
- `git status --short` lists only files allowed by this plan plus
  `plans/README.md`.

Update Plan 001's status in `plans/README.md` to `DONE` only after every gate
passes.

## Test plan

Create database integration coverage under `supabase/tests/`, following
`rls_contracts.sql` for transaction and authenticated-role setup.

Required behavioral cases:

- Successful merge across different physical source containers and locations.
- Exact total-weight conservation.
- Source current weights reduced to zero.
- Source storage and tests preserved.
- Source current storage closed.
- Destination sub-batch and storage created correctly.
- Duplicate, missing, cross-batch, zero-weight, and unauthorized sources
  rejected.
- Cross-organisation, inactive, and collection-purpose destination containers
  rejected.
- Cross-organisation destination location rejected.
- Any rejected call leaves weights and storage unchanged.

For the web layer, keep business validation server-authoritative. If practical,
add a focused component test confirming that merge cannot submit without both
destination fields and that a failed mutation leaves the modal open. Do not
block the database fix on introducing a broad React Testing Library setup if
the existing web test infrastructure cannot render Radix dialogs reliably;
database tests plus typecheck/build are mandatory.

## Done criteria

- [ ] The old `fn_merge_sub_batches(UUID[], TEXT)` signature no longer exists.
- [ ] The new RPC requires destination container and location IDs.
- [ ] No source sub-batch is deleted during a merge.
- [ ] Source current weights become zero through weight adjustments.
- [ ] Source tests, adjustments, and storage history remain queryable.
- [ ] Source open storage records are closed with one merge timestamp.
- [ ] The destination sub-batch has the exact summed weight and selected
      container.
- [ ] The destination has one open storage row at the selected location.
- [ ] Total current batch weight is unchanged.
- [ ] The inventory requires explicit destination selection before merging.
- [ ] `pnpm test:db` passes with new behavioral coverage.
- [ ] Web Vitest, targeted lint, TypeScript, production build, and diff checks
      pass.
- [ ] Generated database types match the new RPC without manual casts.
- [ ] No out-of-scope files are modified.
- [ ] `plans/README.md` marks Plan 001 `DONE`.

## STOP conditions

Stop and report instead of improvising if:

- The current merge no longer keeps the first source and deletes the rest.
- Source zero-weight rows are physically deleted by a trigger or cleanup job
  not identified in this plan.
- `batch_current_weight` counts zeroed sources in a way that changes total
  batch weight after adding the destination.
- Existing business rules require source quality tests to be transferred to
  the merged destination rather than preserved on their tested source portions.
- Storage policy requires a destination to remain optional for a merge.
- Implementing the RPC requires changing batch-level `fn_merge_batches`.
- A required change falls outside the listed scope.
- A verification gate fails twice after a reasonable correction.

## Maintenance notes

- Reviewers should scrutinize weight conservation, row-lock ordering, and the
  absence of source deletes more closely than UI styling.
- Future container labels or QR identifiers should attach to the new
  destination sub-batch, not to historical zero-weight sources.
- Once backlog issue 6 is implemented, the inventory row should visibly show
  the new merge destination's container and location.
- A future first-class `sub_batch_merge` lineage table could link each source
  to its destination. This plan deliberately preserves source rows and
  adjustment reasons without adding a new domain table; if regulatory or audit
  reporting requires explicit lineage, stop and expand the design before
  implementation.

