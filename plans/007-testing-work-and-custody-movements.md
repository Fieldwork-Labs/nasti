# Plan 007: Separate testing work from repeatable custody movements

> **Executor instructions**: Execute in order, verify every step, and stop on a
> STOP condition. Do not improvise around accounting, lineage, or authorization.
> Update this plan's row in `plans/README.md` when complete unless a reviewer
> maintains the index.
>
> **Drift check (run first)**:
>
>     git diff --stat b447573..HEAD -- \
>       packages/common/types apps/web/src/hooks apps/web/src/lib \
>       apps/web/src/components/tests supabase/functions \
>       supabase/migrations supabase/tests
>
> Plan 006 must be DONE. Compare its resulting schema to this plan before work.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plan 006
- **Category**: correctness, architecture, migration, tests
- **Planned at**: commit `b447573`, 2026-08-17

## Why this matters

The current assignment is also the custody lifecycle: returning its one bag
closes it forever, and the first test marks work complete. UAT requires the
opposite separation. Work may finish while retained seed remains at a lab;
that seed may be tested and returned in several later movements.

This plan switches mutations onto the transfer/lineage foundation, adds
explicit work outcomes, supports partial repeated returns and late results,
and supplies auditable correction and discrepancy operations.

## Settled lifecycle

- Work closes as `completed`, `partially_completed`, or `not_completed`.
  Partial/not-completed closure requires a note. Lab users may later correct the
  status with audit history.
- Recording the first test does not close work.
- Work closes explicitly, when the first returned portion in its lineage is
  sent, or automatically as `completed` when recorded tests consume all seed.
- If a first return has no test results, the lab must explicitly choose a work
  status; never infer “completed.”
- Custody movements remain available after work closes. Every return creates a
  new owner-held physical bag with no storage location and preserved lineage.
- A merged returned bag closes every still-open assignment in its ancestry.
- Lab users may test retained seed after work closure. After final return they
  may record a forgotten historical test only when declared `performed_at`
  falls within a custody interval. `recorded_at` is system-generated.
- A final return may close with an acknowledged variance of any size and a
  required reason. It warns but does not require owner approval.
- Later reclassification of variance as forgotten test consumption must not
  deduct weight twice.
- Intentional disposal and owner approval for disposal remain out of scope.

## Current state to replace

- `batch_testing_assignment` has physical `closed_at/outcome` state and no work
  outcome (`20251114000005_create_batch_testing_assignment.sql:4-24`).
- `fn_return_bag_from_testing` accepts only assignment ID, rejects a closed
  assignment, and moves only the original bag
  (`20260804000001_secure_testing_assignments.sql:505-619`).
- `fn_create_quality_test` requires current custody, hardcodes `tested_at =
  now()`, and completes work on the first test
  (`20260804000001_secure_testing_assignments.sql:846-987`).
- `ReturnBatchModal.tsx:76-79` says a retained split becomes the lab's, which is
  explicitly false under the new ownership model.
- `batch_weight_adjustments` has only free-text reasons, so correction and
  reclassification cannot be queried reliably.

Keep the atomic RPC, stable locking order, SQLSTATE mapping, and thin edge
wrapper conventions from the existing assignment/return implementation.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Reset schema | `supabase db reset` | exit 0 |
| Generate types | `pnpm gen-types` | exit 0 |
| Database tests | `pnpm test:db` | all pass |
| Web unit tests | `pnpm --filter=@nasti/web exec vitest run` | all pass |
| Web build | `pnpm --filter=@nasti/web build` | exit 0 |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Assignment work-state schema and audited status changes.
- Grouped testing dispatch using Plan 006 transfer events.
- Partial/repeated return, explicit closure, variance, and correction RPCs plus
  thin edge wrappers.
- Late-test timestamps, historical-custody authorization, and variance
  reclassification.
- Lineage-aware merge/cleaning behavior required by these operations.
- Backend and pure-rule tests; generated types.

**Out of scope**:

- Broad RLS/read-model redesign and weight projections (Plan 008).
- Final unified inventory and complete interaction design (Plan 009). Minimal
  hook/type adaptation needed for compilation is allowed.
- Intentional disposal, ownership sale, receiver acknowledgement/in-transit
  state, third-party forwarding, and sharing other organisations' tests.

## Git workflow

- Branch: `feat/testing-work-custody-movements`
- Suggested commit: `feat: separate testing work from seed custody`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Rewrite lifecycle tests before implementation

Replace assertions that the first test completes work, a return must be whole,
closed assignments cannot return, retained seed changes owner, or assigned bags
cannot merge. Add failing cases for every settled lifecycle rule above.

Include concurrency cases for two returns/tests/corrections racing on the same
bag. Each mutation must lock source bags, assignments, and transfer rows in a
stable UUID order.

**Verify**: `pnpm test:db` → only the new target-behavior assertions fail.

### Step 2: Replace physical assignment closure with work closure

Make the assignment state exclusively about work:

- `work_closed_at`, constrained `work_status`, `work_status_note`, and
  `work_closed_by`;
- an append-only assignment-status audit table containing old/new status, note,
  actor, and timestamps;
- constraints requiring all closure fields together and a nonblank note for
  partial/not-completed outcomes.

Remove `completed_at`, physical `closed_at`, and `returned|consumed` outcome
semantics. “Open assignment” means `work_closed_at IS NULL`; it does not decide
whether a bag is held or returnable.

Add an Admin-authorized lab RPC to close/correct work status. Status correction
appends audit history; it never deletes the earlier closure fact.

**Verify**: state-machine and audit pgTAP assertions pass.

### Step 3: Move outbound assignment onto one transfer event

Update `fn_assign_bags_for_testing` so one request creates one transfer header,
one item per actual moved bag, and one assignment per item. A requested sample
is split first; the moved child and exact dispatch weight are recorded.

Require the caller to both own the parent batch and hold the source bag. Require
an accepted requester→provider link and a provider-capable recipient. Close the
sender's storage row, change custody once, and return a result containing the
transfer plus assignments. Make retries idempotent using an explicit request ID
or another database-enforced idempotency key.

**Verify**: multi-bag grouping, owner+holder authorization, linked-provider, and
retry tests pass.

### Step 4: Implement lineage-aware partial and repeated returns

Replace assignment-addressed return with a transfer operation over held bag
items. For each item accept a source bag and optional positive partial weight:

- whole weight: zero/close the lab source bag and create an owner-held returned
  bag;
- partial weight: split the requested weight into a returned child and leave
  the remainder in lab custody;
- clear/close lab storage for only the returned physical portion;
- give the returned bag no owner storage/container relationship;
- preserve ancestry and link the return item to every originating assignment.

The first return carrying an open assignment closes it using supplied work
outcomes. A merged lineage closes all still-open ancestors. Later returns never
fail merely because work is closed. One return request creates one return event
with one or more items.

If the user declares this the final return, calculate remaining database weight
still held for the same owner/batch/custodian. Allow nonzero variance only with
a nonblank reason, write a typed variance adjustment, and end custody without
phantom stock.

**Verify**: pgTAP covers whole, partial, second/later, merged, final-with-zero,
and final-with-positive/negative variance paths and proves weight conservation.

### Step 5: Decouple tests from open work and add accountable timestamps

Add caller-supplied `performed_at` and immutable system `recorded_at`. Do not
store a separate “new vs forgotten” type. Authorize when:

- the caller currently holds the bag; or
- the caller performed the test during a custody interval proven by immutable
  transfer history, even if it no longer holds seed.

Associate the test with the relevant assignment lineage for audit. A test may
be recorded after work closure and does not reopen it. If test consumption
reaches zero, automatically close every still-open represented assignment as
`completed`.

For a late test whose consumption was already represented by variance, append
a compensating variance reclassification and the typed test-consumption entry
so total current weight is unchanged. Never update/delete the old adjustment.
Reject any operation that would make current weight negative.

**Verify**: current, post-closure, post-final-return, invalid-date, zero-weight,
negative-weight, and no-double-deduction tests pass.

### Step 6: Add immutable transfer correction

Implement one `Correct transfer` boundary:

- before downstream activity, append a reversal event restoring custody and
  mark the original as reversed through immutable linkage, then record the
  corrected event;
- after any split, merge, test, return, cleaning, or later transfer, preserve
  the original and require compensating movement/adjustment events.

Both sides can read actor, time, and reason. Only the original sender's Admin
may initiate correction. The database, not the client, decides whether
downstream activity exists.

**Verify**: wrong weight, wrong recipient, downstream-use, duplicate correction,
and concurrent correction tests pass.

### Step 7: Preserve ownership and custody through merges and cleaning

Remove assignment-based merge blocking. The destination inherits the common
parent batch, owner, custodian, and unioned lineage.

Cleaning foreign-owned seed remains callable at the database level but has no
lab UI entry point. Derived batches remain owned by the source owner; output
bags remain held by the input custodian; the cleaning record identifies the
performing organisation; source assignment ancestry reaches every output bag.

**Verify**: merge and cleaning suites prove owner/custodian separation, lineage,
and conserved total weight.

### Step 8: Update wrappers/types and run the full gate

Keep edge functions transport-only and map deliberate SQLSTATEs. Adapt hooks and
pure state helpers only far enough to compile; Plan 009 owns the final UX.
Regenerate types and run every gate.

## Test plan

Primary coverage belongs in `supabase/tests/sub_batch_testing_assignments.sql`,
with merge cases in `sub_batch_merge.sql` and cleaning cases in
`cleaning_bagging.sql`. Update `apps/web/src/lib/__tests__/testingAssignments.test.ts`
so closed work does not remove custody actions and first test does not complete
work.

At minimum cover: explicit three-status closure; note constraints; status
correction history; grouped dispatch; owner+holder check; partial and repeated
returns; merged ancestry closure; testing after closure; backdated result after
final return; invalid historical date; variance; reclassification; transfer
reversal/correction; concurrent retries; cleaning custody.

## Done criteria

- [ ] Assignment work state is independent from custody.
- [ ] First test does not close work; explicit close and first return do.
- [ ] Tests consuming all represented seed auto-close open work as completed.
- [ ] Any retained/derived positive-weight bag can be returned later.
- [ ] Every returned portion becomes a new owner-held, unstored bag.
- [ ] Late tests validate declared performance time against custody history.
- [ ] Variance reclassification never changes total weight twice.
- [ ] Transfer corrections are additive/auditable, never silent edits.
- [ ] Foreign cleaning preserves owner, custodian, and lineage.
- [ ] All reset/test/build/diff gates pass and the index is updated.

## STOP conditions

- Plan 006 lineage cannot resolve all assignments for a derived bag.
- A return would require arbitrary gram allocation between merged assignments.
  Assignment closure should follow ancestry, while weight reconciles at
  owner/batch/custodian level.
- Historical custody cannot be proven without trusting mutable rows.
- A correction path would update/delete original transfer or adjustment facts.
- The work requires receiver acknowledgement or an in-transit state; UAT
  explicitly chose sender-completes-movement semantics.

## Maintenance notes

Do not infer physical truth beyond accountable declarations. The database can
validate dates against custody history and quantities against its ledger, but
cannot prove when a human performed a test or whether a discrepancy was really
loss rather than disposal.

