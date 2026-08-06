# Implementation Plans

Maintained from focused NASTI audits. The initial cleaning, bagging, container,
and storage audit was recorded on 2026-07-28; the testing-organisation and batch
assignment audit was added on 2026-07-29. Execute plans in the order below
unless their dependency notes say otherwise. Each executor must read its plan
fully, honor its STOP conditions, run every verification command, and update
the status row when finished.

## Execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
|---|---|---:|---:|---|---|
| [001](./001-container-aware-sub-batch-merge.md) | Preserve physical storage semantics when merging sub-batches | P1 | M | — | DONE |
| [003](./003-complete-testing-organisation-assignments.md) | Complete and secure testing-organisation assignments | P1 | L | — | DONE — `feat/new-inventory` |
| [004](./004-sub-batch-testing-assignments.md) | Make testing assignments bag-based | P1 | L | 003 | TODO |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED` with a reason, or
`REJECTED` with a rationale.

### Plan 003 completion notes

Every Done criterion in Plan 003 is satisfied. All database work landed in a
single migration,
`supabase/migrations/20260804000001_secure_testing_assignments.sql`, and
`pnpm test:db` passes 174 assertions across 8 files against it.

The migration was verified in both directions: applied fresh onto the
pre-migration schema inside a rolled-back transaction while the whole pgTAP
suite ran against it, and then again on top of itself once applied for real,
confirming it is safe to re-apply. Its dependencies — the `batch_quality` and
`org_permission` enums, `batch_testing_assignment`, `batch_custody`,
`organisation_link`, `storage_locations` — are all created by earlier
migrations, and its two `CREATE OR REPLACE FUNCTION` statements match the
signatures left by `20260728000001`.

Note for whoever next runs `supabase db reset`: this migration and
`20260803000000_member_permissions.sql` were both applied out of band, so
`supabase_migrations.schema_migrations` tops out at `20260729000002` and a reset
will replay them. A reset also exercises Supabase's own bootstrap, including the
`powersync_role` prerequisite that has broken resets on this project before.
That is a pre-existing condition, unrelated to this plan.

## Audit backlog

These findings are recorded here so they can be planned and implemented one at
a time without repeating the audit.

| Issue | Finding | Priority | Effort | Recommended outcome |
|---:|---|---:|---:|---|
| 2 | Bagging cannot be resumed after its modal is dismissed, refreshed, or fails | P1 | M | **DEFERRED:** bagging must remain optional; see [decision note](./002-optional-bagging-recovery-decisions.md) |
| 3 | Moving a sub-batch between storage locations uses separate update and insert requests | P1 | S–M | **DONE:** one locked, tenant-validated RPC now stores, moves, or removes a sub-batch atomically |
| 4 | Deleting an unused storage location cascades all historical storage records | P1 | S–M | **DONE:** unused locations are deleted atomically; referenced locations are retired, remain visible in history/current storage, and can be reactivated |
| 5 | Direct authenticated writes can associate sub-batches or storage rows with another organisation's container/location | P1 | M | **DONE:** custody-aware database triggers now reject cross-organisation, inactive, and wrong-purpose container/location relationships on direct inserts and updates |
| 6 | Inventory omits container names and container settings count only collection usage | P2 | M | **DONE:** inventory joins and displays container names; Settings reports complete collection and storage sub-batch usage separately |
| 7 | A used container can have its purpose changed retroactively | P2 | S–M | **DONE:** purpose is immutable from creation; containers can still be renamed, activated, deactivated, or replaced |
| 8 | Cleaning, bagging, split, merge, and storage RPCs lack behavioral integration coverage | P1 | M | Add pgTAP tests for weight conservation, tenancy, retry behavior, and history preservation |
| 9 | Cleaning photo upload/delete sequences can leave orphaned objects or broken metadata | P2 | M | Add compensating cleanup and retry-safe upload/delete behavior |

## Dependency notes

- Plan 003 is independent of the completed merge plan, but its custody-transfer
  implementation must preserve the storage-tenancy invariants introduced by
  `20260729000001_storage_relationship_tenancy.sql`.
- Plan 004 builds on Plan 003's secured assignment/RLS contract, but changes the
  physical assignment unit from a parent batch to one `sub_batch`/bag, and moves
  custody onto the bag as `sub_batches.held_by_org_id`. Nothing is deployed and
  there is no legacy data, so it edits the existing migrations in place rather
  than appending new ones.
- Plan 004 removes treatments rather than making them bag-scoped: Testing
  organisations only test. `fn_treat_batch` goes; the `treatments` table and the
  views that join it stay and go empty, pending a stakeholder decision.
- Plan 004 is backend-first. The assignment UI is being redesigned separately,
  so the plan deletes the old modal instead of porting it.
- Issue 8 should be implemented alongside or immediately before issues 1–5.
  Plan 001 includes the merge-specific database tests needed to make issue 1
  safe; issue 8 remains broader processing-workflow coverage.
- Issue 6 should follow issue 1 because the merge destination container and
  location should be visible in the improved inventory row.
- Issue 7 should follow issue 6 so the settings page can make its immutability
  decision from complete collection and storage usage data.
- Issue 2 can proceed independently of issue 1, but both affect the transition
  from cleaning outputs to physical stored sub-batches.

## Evidence index

- Testing assignment/custody, RLS, treatment privilege, status-dashboard, and
  permission-filter evidence is consolidated in
  [Plan 003](./003-complete-testing-organisation-assignments.md).
- Arbitrary sub-batch merging currently keeps the first selected sub-batch and
  deletes the rest:
  `supabase/migrations/20260728000001_numeric_weights.sql:875-949` and
  `apps/web/src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx:38-55`.
- Bagging is opened only from transient state after cleaning:
  `apps/web/src/routes/_private/inventory/-components/general.tsx:432-450`;
  its modal remains dismissible at
  `apps/web/src/components/inventory/modals/CleaningBaggingModal.tsx:29-55`.
- Storage moves perform two writes at
  `apps/web/src/hooks/useBatchStorage.ts:315-350`.
- Storage-location deletion checks only current occupancy at
  `apps/web/src/hooks/useBatchStorage.ts:265-290`, while
  `supabase/migrations/20250908094429_batches.sql:125-133` uses
  `ON DELETE CASCADE`.
- Direct sub-batch and storage RLS checks only batch custody at
  `supabase/migrations/20260723000005_rls_perf_rewrite.sql:379-390` and
  `:775-789`.
- Container display and usage gaps are at
  `apps/web/src/hooks/useSubBatches.ts:17-64`,
  `apps/web/src/routes/_private/inventory/-components/BatchTableRow/Common/SubBatches.tsx:169-185`,
  and `apps/web/src/hooks/useContainers.ts:163-179`.
- Container purpose remains editable at
  `apps/web/src/components/containers/ContainerForm.tsx:127-154`.
- Existing pgTAP coverage is structural rather than behavioral:
  `supabase/tests/rls_contracts.sql`.
- Cleaning photo storage and metadata are separate multi-step operations at
  `apps/web/src/hooks/useBatchCleaningPhotos.ts:86-188`.

## Verified strengths

The audit checked these areas and did not reopen them:

- Bagging weight conservation is enforced on both client and server.
- Bagging and split RPCs validate active storage-purpose containers and
  organisation ownership.
- Bagging is atomic and serializes duplicate concurrent attempts.
- Split container and location assignments are atomic.
- Cleaning photo galleries order before photos ahead of after photos.
- Container deletion is protected by foreign-key restriction once referenced.

## Findings considered and rejected

- Adding PowerSync/mobile support for sub-batch storage was not planned because
  batch processing is currently an office-web responsibility and sub-batches
  are not part of the mobile sync model.
- Replacing the container catalogue with unique physical-container records was
  not planned. The current product request treats catalogue rows as container
  types and individual sub-batches as the physical portions; labels or QR codes
  remain a future product option.
