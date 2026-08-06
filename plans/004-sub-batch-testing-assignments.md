# Plan 004: Make testing assignments bag-based

> Executor instructions: follow this plan step by step. This plan is
> **backend-first**; the only front-end work in scope is deleting what the
> backend change kills and making the web app compile again. Do not build new
> assignment UI. Stop and report if any STOP condition occurs. When complete,
> update the status row in plans/README.md unless a reviewer told you to
> maintain the index.
>
> **Step 1 is DONE** (commit 1abb177). The custody-versus-ownership decision is
> recorded below, so Steps 2-9 are unblocked.

Drift check (run first):

    git diff --stat 73c40f8..HEAD -- \
      apps/web/src/components/inventory/modals \
      apps/web/src/components/tests \
      apps/web/src/components/testing-orgs \
      apps/web/src/hooks \
      apps/web/src/lib/testingAssignments.ts \
      apps/web/src/routes/_private/inventory/-components \
      packages/common/types \
      supabase/functions \
      supabase/migrations \
      supabase/tests

The working tree contains unrelated user changes in
apps/web/src/components/invitations/InvitationForm.tsx,
apps/web/src/routes/_private/people/index.tsx,
supabase/migrations/20260805000001_testing_org_member_permissions.sql, and
supabase/tests/testing_org_member_permissions.sql. Preserve them; they are not
part of this plan.

## Status

- Priority: P1
- Effort: L
- Risk: HIGH
- Depends on: Plan 003
- Category: architecture, migration, bug, tests
- Planned at: commit 73c40f8, 2026-08-06
- Rescoped: 2026-08-06 after product decisions recorded below
- Amended: 2026-08-06 after reviewer findings; see "Reviewer findings: resolution"

## Why this matters

`batch_testing_assignment.batch_id` still treats a whole batch as the physical
unit sent, tested, returned, and displayed. That stopped being true when
sub_batches became the bags: storage, tests, weight adjustments, splitting,
merging, and bagging all identify the physical portion with `sub_batch_id`. A
batch-level assignment therefore either exposes every sibling bag to a Testing
organisation or lets a whole-batch operation consume more seed than was
actually sent.

After this plan, one assignment is one bag, and custody is a property of the
bag rather than the batch.

## Product decisions driving this rescope

These were settled on 2026-08-06 and override the original plan text.

1. **Treatments are gone.** Testing organisations only test. There is no
   bag-scoped treatment path, and `fn_treat_batch` is removed. The `treatments`
   table and the views that join it stay in place and go empty — full excision
   is deferred pending stakeholder discussion.
2. **A sample is just a bag.** Sending a sample splits the source bag and
   assigns the child. There is no stored sample/full-batch discriminator,
   no `sample_weight_grams`, and no `subsample_*` columns: a Testing
   organisation's retained QA subsample is an ordinary split they perform on
   their side before returning.
3. **`organisation_link.can_test` / `can_process` are meaningless** now that
   every assignment is the same thing. Both columns go, from links and link
   requests.
4. **Custody is per bag.** `sub_batches` gains `held_by_org_id`. `batch_custody`
   becomes redundant — with treatments and full-batch assignment gone, every
   remaining write to it is "a batch was just created", so it never diverges
   from `batches.organisation_id`.
5. **Displayed weight is custody-relative.** Only bags in the viewer's custody
   count toward a batch's displayed current weight.
6. **Nothing is deployed and there is no production data.** Migrations are
   edited **in place** rather than appended. The executor does not run `supabase
   db reset`, `supabase db push`, `psql`, or `pnpm gen-types` — see
   "Verification protocol".

   As of Step 1 the user applies changes by running `supabase db reset` against
   an adjusted `seed.sql`, not by applying a catch-up script. Migrations must
   therefore be correct **from scratch**; there is no incremental path to keep
   working and no backfill to write. New columns may be declared `NOT NULL`
   outright.
7. **An assignment closes on one of two outcomes.** A bag that comes back is
   `returned`; a bag entirely consumed in testing is `consumed` and is not
   returnable, because there is nothing to return. `returned_at` is therefore
   renamed `closed_at` and paired with an `outcome` column. Active means
   `closed_at IS NULL`.

8. **A retained bag belongs to the Testing organisation.** Decided 2026-08-06:
   the originating General organisation has no visibility over the portion a
   Testing organisation retains. So `held_by_org_id` carries **ownership**
   semantics for a bag split off on the Testing side, not merely custody.

   Concretely, a bag is readable by the caller when either:

   - the caller's organisation is its `held_by_org_id`; or
   - an assignment row exists for that exact `sub_batch_id` whose
     `assigned_by_org_id` is the caller's organisation — this is how a General
     organisation keeps sight of a bag while it is out at a lab.

   A retained bag satisfies neither test for General: it is held by Testing and
   has no assignment of its own. It is therefore invisible to General, which is
   the intended outcome.

Still deferred, recorded so it is not silently re-decided:

- Whether treatments removal goes further than dropping the RPCs. Step 1 took
  the minimal path; the `treatments` table and its views remain.

Follow-up, explicitly not in this plan: there is no way to reverse a weight
adjustment, so correcting a mis-recorded test consumption means hand-inserting a
compensating row. A manual weight-correction path is its own piece of work.

## Access model

This table is the contract the RLS work in Steps 3 and 5 must satisfy, and the
one the pgTAP suite asserts. It encodes decision 8: a bag retained by a Testing
organisation is **theirs**, and General cannot see it.

Reading `Y` = row is selectable, `—` = not selectable.

| Reader | Assigned bag | Sibling bags | Retained bag (Testing split, after return) | Parent batch metadata | Tests on assigned bag | Container of assigned bag | General's storage locations | Closed assignment row |
|---|---|---|---|---|---|---|---|---|
| General, owner org | Y | Y | — | Y | Y | Y | Y | Y |
| Testing, assigned org, while active | Y | — | Y (theirs) | Y | Y | Y | — | Y |
| Testing, after close | — | — | Y (theirs) | — | — | — | — | Y |
| Any other organisation | — | — | — | — | — | — | — | — |

Notes:

- A General organisation sees the assigned bag while it is out because an
  assignment row names it as the sender, not because it owns the parent batch.
  A parent-batch-only predicate would leak the retained bag and is wrong here.
- Admin versus Member changes what a user may **do**, not what they may see.
  Read visibility is per organisation and gated by the existing `org_permission`
  system from `20260803000000_member_permissions.sql` and the user's untracked
  `20260805000001_testing_org_member_permissions.sql`. This plan does not change
  either.
- Only a General **Admin** may create or close an assignment. A General Member
  is rejected, as in Plan 003.
- "Retained bag" is a bag a Testing organisation split off an assigned bag and
  kept. It is held by Testing permanently and has no assignment of its own.
- Displayed weight follows custody, so the same parent batch reports different
  current weights to General and to Testing. That is intended.

## Current state

### Assignment and custody

- `batch_testing_assignment`
  (supabase/migrations/20251114000005_create_batch_testing_assignment.sql:4-24)
  has a required `batch_id`, no `sub_batch_id`, and sample/subsample columns
  that this plan deletes.
- supabase/migrations/20260804000001_secure_testing_assignments.sql:50-57
  enforces one active assignment per batch, preventing two bags from one batch
  being assigned independently.
- The same migration at 62-333 validates sample weight against the **parent
  batch** weight and writes `batch_custody` for every `full_batch` assignment.
- The same migration at 347-497 returns by assignment ID but resolves only
  `v_assignment.batch_id`.
- The same migration at 548-601 defines `has_active_testing_assignment`,
  `is_batch_owner`, and `can_read_batch` — all batch-grained.
- The same migration at 631-633 lets an assigned Testing organisation select
  **every** `sub_batches` row in the parent batch.
- The same migration at 642-668 gates `collection` and `species` visibility on
  `has_active_testing_assignment`.
- The same migration at 692-701 authorises test visibility by `batch_id`,
  current batch custodian, or performing organisation rather than exact bag.
- The same migration at 1011-1116 records tests against `p_sub_batch_id` but
  authorises and completes by `p_batch_id`. It already writes the consumed-seed
  weight adjustment at :1096, but never checks that adjustment against the bag's
  current weight, so a test can drive a bag negative.
- `is_current_custodian(uuid, uuid)`
  (supabase/migrations/20260723000005_rls_perf_rewrite.sql:24) reads the latest
  `batch_custody` row and is the single chokepoint for roughly forty call sites
  across RLS policies and every bag RPC.

### Policies that are batch-grained and must not stay that way

Redefining `is_current_custodian` as an owner check (Step 2) silently *widens*
every one of these, because the owner would gain rights over bags they no longer
hold. All are in supabase/migrations/20260723000005_rls_perf_rewrite.sql:

- `:366-370` — `treatments_all` is `FOR ALL TO authenticated`, so removing
  `fn_treat_batch` does not stop direct inserts.
- `:375-390` — `batch_storage` select, insert and update.
- `:569-583` — `tests_insert` authorises any sub-batch in a batch with an active
  assignment, which is the sibling leak in write form.
- `:775-789` — `sub_batches` select, insert, update and delete. `held_by_org_id`
  is a column on this table, so an unguarded UPDATE lets an owner write custody
  back to themselves.
- `:797-812` — `batch_weight_adjustments` select and insert. The select side
  matters as much as the insert side: `sub_batch_current_weight` is
  `security_invoker`, so a Testing organisation that cannot read adjustments
  sees its own bag's original weight instead of its current weight.

### Operations that can consume, delete or merge assigned material

- supabase/migrations/20260728000001_numeric_weights.sql:483 gates
  `fn_clean_sub_batch` on the parent batch.
- supabase/migrations/20260728000001_numeric_weights.sql:972 merges whole
  batches via `assert_same_custodian` with no assignment awareness.
- The sub-batch merge variants in 20260728000005 and 20260728000007 gate on the
  parent batch.

### Bag primitives to reuse

- supabase/migrations/20260723000001_sub_batches_and_cleaning.sql:5-14 defines
  `sub_batches` with `(id, batch_id)` uniqueness and positive original weight.
- supabase/migrations/20260728000004_split_sub_batch_containers.sql:7-160 is
  `fn_split_sub_batch`: it deducts via `batch_weight_adjustments`, creates
  children under the **same** parent batch, and takes optional `container_id`
  and `location_id`. This is the sample mechanism.
- supabase/migrations/20260728000003_cleaning_bagging_storage.sql:20-50 defines
  `active_sub_batches`; supabase/migrations/20260728000001_numeric_weights.sql:43-80
  defines `batch_current_weight` and `sub_batch_current_weight`. None filter by
  custody. `active_batches` at :268 filters out zero-weight rows.
- supabase/migrations/20260728000008_atomic_sub_batch_storage.sql:64 and
  supabase/migrations/20260729000001_storage_relationship_tenancy.sql:8-108
  gate storage on the current **batch** custodian.

## Target architecture

1. `sub_batches.held_by_org_id` is the single answer to "who holds this bag".
   It defaults to the parent batch's owner via a `BEFORE INSERT` trigger, so no
   existing bag-creating path has to be edited. Split and merge set it to the
   calling organisation; assign sets it to the Testing organisation; return sets
   it back to the parent batch's owner. Nothing is inferred from assignment
   state.
2. `held_by_org_id` is not directly writable by `authenticated`. Custody moves
   only through the reviewed `SECURITY DEFINER` RPCs.
3. Each assignment has a non-null `sub_batch_id` and a matching `batch_id`,
   retained as a denormalised parent key for joins and history.
4. A parent batch may have several active assignments provided they target
   different bags. A bag has at most one active assignment.
5. `is_current_custodian(uuid, uuid)` keeps its name and its call sites but is
   redefined as a batch **owner** check, which is what it now provably means.
   A new `is_current_bag_custodian(uuid, uuid)` answers bag-grained questions.
6. Every policy and RPC that reads or writes bag-level material is bag-grained.
   A batch-only predicate leaks siblings on read and grants the owner power over
   Testing-held bags on write.
7. A quality test is authorised by bag custody alone — which covers General
   testing its own bag and Testing testing an assigned one — completes only the
   assignment for that exact bag, and cannot consume more than the bag holds.
8. An assignment closes as `returned` or `consumed`. A consumed bag is not
   returnable.
9. `batch_current_weight`, `active_batches`, and `active_sub_batches` count only
   bags held by the caller's organisation.
10. Assigning a bag removes it from the General organisation's storage location:
    it is in the mail, not on a shelf.

## Verification protocol

The executor does **not** touch the database. For each step:

1. Make the in-place migration edits, correct from a fresh reset.
2. Report to the user, who runs `supabase db reset`, `pnpm test:db` and
   `pnpm gen-types`, then reports results back.

There is no catch-up script: the user resets from migrations plus `seed.sql`.
If a change requires a `seed.sql` adjustment, say so explicitly in the report —
that is the one thing a reset cannot infer.

| Purpose | Command | Who runs it |
|---|---|---|
| Database tests | `pnpm test:db` | user |
| Generate types | `pnpm gen-types` | user |
| Fresh reset (pre-deploy only) | `supabase db reset` | user |
| Web tests | `pnpm --filter=@nasti/web exec vitest run` | executor |
| Typecheck | `pnpm --filter=@nasti/web exec tsc -b` | executor |
| Targeted lint | `pnpm --filter=@nasti/web exec eslint <changed paths>` | executor |
| Production build | `pnpm --filter=@nasti/web build` | executor |
| Diff hygiene | `git diff --check` | executor |

Never hand-edit packages/common/types/database.ts. Typecheck and build cannot
pass until the user has run `pnpm gen-types`, so Steps 6-8 block on that.

## Scope

In scope:

- In-place edits to existing migrations (enumerated per step).
- `supabase/tests/testing_organisation_assignments.sql` plus a new
  `supabase/tests/sub_batch_testing_assignments.sql` for multi-bag fixtures.
- Both testing-assignment edge wrappers, hard-switched to bag payloads.
- Generated `packages/common/types/database.ts` and the assignment aliases in
  `packages/common/types/index.ts`.
- Assignment/testing hooks and `apps/web/src/lib/testingAssignments.ts`.
- Deleting dead treatment and assignment-modal UI, and whatever minimal edits
  are needed elsewhere to make typecheck, lint, tests, and build pass.
- plans/README.md status row.

Out of scope:

- New assignment UI. It is being redesigned separately. **This branch therefore
  ships with assignment creation unavailable, by design.** The Testing side
  stays fully functional for assignments created directly against the RPC, and
  the pgTAP suite is the acceptance gate for assignment creation until the
  replacement UI lands. Do not merge to a deployed environment before it does.
- A manual weight-correction path.
- Dropping the `treatments` table or rewriting the views that join it.
- Dropping `batch_custody`.
- Renaming the deployed edge-function directories/URLs.
- Mobile or PowerSync assignment workflows.
- The unrelated working-tree changes named at the top of this plan.

## Git workflow

- Branch: `feat/sub-batch-testing-assignments`
- Conventional Commits. Suggested sequence:
  - `refactor: remove treatments and link capabilities`
  - `feat: make custody a property of the bag` (Steps 2 and 3 together)
  - `feat: make testing assignments bag-based`
- Do not push or open a pull request unless explicitly instructed.

## Steps

### Step 1: Remove treatments and link capabilities

Do this first: it deletes code that later steps would otherwise have to keep
working. This step does not depend on the custody-versus-ownership decision.

1. In supabase/migrations/20260804000001_secure_testing_assignments.sql, delete
   section 3 (`fn_treat_batch`, from the section banner through its GRANT).
2. In supabase/migrations/20260728000001_numeric_weights.sql:1151, delete the
   `fn_treat_batch` definition and its grants. Do the same for the older
   `fn_process_batch`/`fn_treat_batch` in
   supabase/migrations/20251016000005_create_fn_process_batch.sql. Leave
   `treatments`, `batch_lineage`, `active_batches`, and
   `quality_test_statistics` alone — they keep referencing an empty table.
3. Replace `treatments_all`
   (supabase/migrations/20260723000005_rls_perf_rewrite.sql:366-370) with a
   SELECT-only policy for the batch owner. Without this, the claim that the
   table stays empty is unenforceable: any authenticated user can insert
   directly once the RPC is gone.
4. Drop `can_process` and `can_test` from
   supabase/migrations/20251114000002_create_organisation_links.sql:8-9 and
   supabase/migrations/20251114000003_create_organisation_link_requests.sql:8-9,
   and remove every read/write of them in
   supabase/functions/create_link_request/index.ts and
   supabase/functions/accept_link_request/index.ts.
5. Delete the capability logic from apps/web/src/lib/testingAssignments.ts
   (`LinkCapabilities`, `getRequiredCapabilities`,
   `linkSupportsAssignmentTypes`, `AssignmentType`) and the matching cases in
   apps/web/src/lib/__tests__/testingAssignments.test.ts. Keep
   `getAssignmentStatus` and the inventory status filters.
6. Remove the capability columns from the query and result type in
   apps/web/src/hooks/useTestingOrgs.ts:98-125, and the capability badges in
   apps/web/src/components/testing-orgs/LinkRequestModal.tsx:37,80-90,
   TestingOrgsManagement.tsx:236,327, and TestingOrgLinks.tsx:114,176.
   `rg 'can_test|can_process'` must return nothing outside generated types.
7. Delete apps/web/src/components/inventory/modals/BatchProcessingModal.tsx,
   apps/web/src/components/batches/BatchTreatmentForm.tsx,
   apps/web/src/hooks/useTreatBatch.ts, apps/web/src/hooks/useBatchTreating.ts,
   apps/web/src/hooks/useProcessBatch.ts,
   apps/web/src/hooks/useBatchProcessing.ts, and the modal barrel entry. Remove
   the treat entry points in
   apps/web/src/routes/_private/inventory/-components/general.tsx and
   testing.tsx, and the treating branch in
   apps/web/src/components/inventory/BatchHistory/index.tsx.
8. Delete apps/web/src/components/inventory/modals/AssignBatchesForTestingModal.tsx
   and its barrel entry.

STOP if removing `fn_treat_batch` breaks a view or policy that this plan has
not listed.

### Step 2: Make custody a property of the bag

Edit supabase/migrations/20260723000001_sub_batches_and_cleaning.sql:5-14 to add
`held_by_org_id UUID NOT NULL REFERENCES organisation(id)`, plus an index. Add a
`BEFORE INSERT` trigger in the same migration that defaults it to the parent
batch's `organisation_id` when the insert does not supply one, so cleaning,
bagging, initial creation, split, and merge all keep working untouched.

Protect the column from direct writes:

    REVOKE UPDATE (held_by_org_id) ON public.sub_batches FROM authenticated;

The reviewed RPCs are `SECURITY DEFINER` and run as the table owner, so they are
unaffected. Prefer this to a trigger with a session flag — it is declarative and
cannot be bypassed by a caller who sets the flag themselves.

In supabase/migrations/20260723000005_rls_perf_rewrite.sql:24, redefine
`is_current_custodian(uuid, uuid)` as a batch-owner check and comment why the
name is retained. Add `is_current_bag_custodian(uuid, uuid)` reading
`sub_batches.held_by_org_id`, `SECURITY DEFINER`, `search_path = ''`, revoked
from PUBLIC and anon, granted to authenticated — matching the conventions of the
predicates already in that file.

Then make the bag operations custody-aware:

- `fn_split_sub_batch`
  (supabase/migrations/20260728000004_split_sub_batch_containers.sql:41): gate on
  `is_current_bag_custodian`, and set each child's `held_by_org_id` to the
  calling organisation. The gate guarantees that equals the source bag's holder.
- The merge RPCs in 20260728000005 and 20260728000007: same gate, and refuse to
  merge bags held by different organisations.
- `fn_set_sub_batch_storage`
  (supabase/migrations/20260728000008_atomic_sub_batch_storage.sql:64): same gate.
- `validate_sub_batch_storage_container` and `validate_active_storage_location`
  (supabase/migrations/20260729000001_storage_relationship_tenancy.sql:8-108):
  validate the container and location against the **bag's holder** rather than
  the batch custodian, so a Testing organisation can put a bag it holds into its
  own container without gaining any access to General's catalogue.

Finally make weight custody-relative. In
supabase/migrations/20260728000001_numeric_weights.sql:43-80, filter
`batch_current_weight` to bags whose `held_by_org_id` matches the caller's
organisation, and do the same for `active_sub_batches`
(supabase/migrations/20260728000003_cleaning_bagging_storage.sql:20) and
`active_batches`. `sub_batch_current_weight` stays objective — it is per bag, so
custody is already implied by whether the caller can see the row at all.

STOP if making the weight views caller-relative breaks a PowerSync publication
or a view that a non-authenticated role reads.

### Step 3: Make every read and write policy bag-grained

**This step ships in the same commit as Step 2.** Step 2 changes what
`is_current_custodian` means; until this step lands, every policy built on it
has silently changed meaning in the wrong direction, and the custody model is
unenforceable.

All line references are supabase/migrations/20260723000005_rls_perf_rewrite.sql.

Writes:

- `sub_batches` insert/update/delete (:779-789) — gate on
  `is_current_bag_custodian`. Combined with the column REVOKE from Step 2, an
  owner can no longer mutate or delete a Testing-held bag or rewrite its
  custody.
- `batch_weight_adjustments_insert` (:806-812) — gate on the bag's holder.
  Otherwise an owner can zero a Testing-held bag directly.
- `batch_storage` insert/update (:383-390) — gate on the bag's holder.
- `tests_insert` (:569-583) — drop it. `fn_create_quality_test` is
  `SECURITY DEFINER` and is the only intended writer. If a direct path proves
  necessary, scope it to `is_current_bag_custodian` on `tests.sub_batch_id`,
  never to the parent batch.

Reads:

- `batch_weight_adjustments_select` (:799-805) — bag holder or parent batch
  owner. This is required for correctness, not just access: `sub_batch_current_weight`
  is `security_invoker`, so a Testing organisation that cannot read adjustments
  sees its bag's original weight where the UI and the test form expect its
  current weight.
- `batch_storage_select` (:379-381) — bag holder or parent batch owner.

Operations that consume, delete, or merge:

- `fn_clean_sub_batch`
  (supabase/migrations/20260728000001_numeric_weights.sql:483) — gate on
  `is_current_bag_custodian` and **reject** a bag with an active assignment.
- Whole-batch merge
  (supabase/migrations/20260728000001_numeric_weights.sql:972) — **reject** if
  any bag of any source batch has an active assignment or is held by another
  organisation.
- Sub-batch merge variants (20260728000005, 20260728000007) — same rejection.
- Parent batch deletion — **reject** while any of its bags has an active
  assignment.

The rule for all four is rejection, not auto-closing and not moving the
assignment to a successor. An assignment is a physical fact about seed in
someone else's hands; the software must not resolve it unilaterally. Record this
in the function comments, not only in the maintenance notes.

STOP if any of these operations cannot be made bag-grained without changing a
signature that generated types or the web client depend on.

### Step 4: Reshape the assignment table

In supabase/migrations/20251114000005_create_batch_testing_assignment.sql, delete
`assignment_type`, `sample_weight_grams`, `subsample_weight_grams`,
`subsample_storage_location_id`, the sample-weight check constraint, and the
subsample-location foreign key. Rename `returned_at` to `closed_at` and add
`outcome text CHECK (outcome IN ('returned','consumed'))`, null while active.
Keep `batch_id`, both organisation columns, `assigned_at`, and `completed_at`
— `completed_at` still means "first test recorded".

`sub_batch_id` cannot be added there — that migration runs before `sub_batches`
exists. Add it at the top of
supabase/migrations/20260804000001_secure_testing_assignments.sql instead:

1. `sub_batch_id UUID NOT NULL`.
2. A composite foreign key `(sub_batch_id, batch_id)` to `sub_batches(id,
   batch_id)`, following the denormalised-parent pattern used by `batch_storage`
   in 20260723000001_sub_batches_and_cleaning.sql:182-190.
3. An index on `sub_batch_id`.
4. Replace the active-per-batch unique index at :50-57 with a partial unique
   index on `sub_batch_id` where `closed_at IS NULL`.
5. A check constraint tying the two together: `closed_at IS NULL` if and only if
   `outcome IS NULL`.

Every `returned_at IS NULL` predicate in the codebase becomes
`closed_at IS NULL`. `rg 'returned_at'` must return nothing outside generated
types once this step and Step 6 are done.

### Step 5: Rewrite the RPCs and access predicates

All in supabase/migrations/20260804000001_secure_testing_assignments.sql. Keep
the exception-code contract at :22-29, validate before the first write, and
revoke PUBLIC/anon while granting authenticated on every function.

**Assign.** Replace `fn_assign_batches_for_testing(uuid, jsonb)` with
`fn_assign_bags_for_testing(p_testing_org_id uuid, p_bags jsonb)`. Each item:

    {
      "sub_batch_id": "<bag uuid>",
      "sample_weight_grams": 25,          // optional
      "container_id": "<container uuid>"  // optional, the mailing container
    }

With `sample_weight_grams` present the function splits that weight off the named
bag and assigns the **child**; without it, it assigns the named bag itself. The
split must reuse the existing split mechanism rather than reimplementing weight
arithmetic. The function must:

- reject null/empty arrays, malformed IDs, duplicate `sub_batch_id` values, and
  items missing `sub_batch_id`;
- require the caller to be a General **Admin**;
- lock bags in UUID order, then distinct parent batches in UUID order;
- verify each bag exists, has positive current weight, and is held by the
  calling General organisation;
- verify the target is a `Testing` organisation with an accepted link to the
  caller (no capability check — those columns are gone);
- require the sample weight, when given, to be positive and strictly less than
  that bag's current weight;
- reject a bag that already has an active assignment;
- set the assigned bag's `held_by_org_id` to the Testing organisation;
- remove the assigned bag from its storage location, reusing the removal path in
  `fn_set_sub_batch_storage`;
- write no `batch_custody` row; and
- return rows ordered by `sub_batch_id`.

**Return.** Replace `fn_return_batch_from_testing(uuid, numeric, uuid)` with
`fn_return_bag_from_testing(p_assignment_id uuid)`. The subsample parameters are
gone. It locks the assignment, rejects one already closed, sets
`closed_at = now()` and `outcome = 'returned'`, and sets the bag's
`held_by_org_id` back to the parent batch's owner. It writes no `batch_custody`
row.

**Quality test.** In `fn_create_quality_test` (:1011):

- Replace the `is_current_custodian OR any active assignment for p_batch_id`
  check with `is_current_bag_custodian(auth.uid(), p_sub_batch_id)` — one
  predicate now covers General testing its own bag and Testing testing an
  assigned one.
- Keep the sub-batch-belongs-to-batch check.
- **Reject consumption greater than the bag's current weight.** The function
  currently sums the repeat weights and writes the negative adjustment without
  comparison, so a 60g test against a 50g bag drives it to −10g.
- Lock the assignment for `p_sub_batch_id` before inserting, and set
  `completed_at` on that assignment only, not every assignment sharing
  `p_batch_id`.
- If the consumption brings the bag to exactly zero, close the assignment with
  `outcome = 'consumed'`. There is nothing left to return, and leaving it open
  would strand it in the Testing organisation's outstanding list forever while
  `active_sub_batches` has already dropped the bag.

**Predicates and RLS.** Replace `has_active_testing_assignment(uuid)` with
`holds_any_bag_of_batch(p_batch_id uuid)`, and redefine `can_read_batch` as
owner or holder-of-any-bag. `rg 'has_active_testing_assignment'` must return
nothing outside generated types afterwards — it currently has call sites at
:600, :650 and :665. Then:

- `batches_select` (:625) — unchanged call to `can_read_batch(id)`, which now
  means a Testing organisation sees parent metadata because it holds a bag, not
  because an assignment row names the batch.
- `sub_batches_select` (:631-633) — replace `can_read_batch(batch_id)` with a
  bag-grained predicate: the parent batch's owner, or the bag's holder. This is
  the sibling-leak fix.
- `collection_select` (:642-654) and `species_select` (:656-668) — swap the
  helper for `holds_any_bag_of_batch`. Missing these leaves collection and
  species visible through a returned assignment.
- `tests_select` (:692-701) — owner, bag holder, or performing organisation.
- `containers` — add: a container referenced by a bag the caller holds. This is
  how a Testing organisation learns the name of the bag or box its seed arrived
  in, without seeing the rest of General's catalogue.
- `storage_locations` — unchanged. A Testing organisation never sees General's
  locations, and the assigned bag has no storage row while in transit.
- `batch_storage` — bag holder or parent batch owner (also covered by Step 3).
- `batch_testing_assignment` — SELECT stays open to both organisations for
  history; INSERT/UPDATE/DELETE policies remain absent.

STOP if a Testing organisation can only reach its bag through a parent aggregate
that also exposes siblings. Add a reviewed exact-bag relation rather than
falling back.

### Step 6: Edge wrappers, generated types, hooks

1. Hard-switch supabase/functions/assign_batches_for_testing/index.ts to a
   `sub_batch_assignments` array of the Step 5 item shape and call
   `fn_assign_bags_for_testing`. No back-compat branch, no `batch_id`-only path.
   Keep the deployed directory name.
2. Reduce supabase/functions/return_batch_from_testing/index.ts to a thin
   wrapper over `fn_return_bag_from_testing(assignment_id)`; drop the subsample
   parameters. Keep error mapping; do not duplicate database authorization.
3. Ask the user to run `pnpm gen-types`, then update
   packages/common/types/index.ts:223-234 so the assignment aliases carry
   `sub_batch_id`, `closed_at` and `outcome`, and drop the removed columns.
4. Update apps/web/src/hooks/useAssignBatchesForTesting.ts to send
   `sub_batch_id` and invalidate by bag, parent batch, assignments, tests, and
   storage.
5. In apps/web/src/hooks/useBatchAssignments.ts, add an active-assignment query
   indexed by `sub_batch_id`, keyed on `closed_at IS NULL`.
6. Rewrite `useAssignedBatchesByFilter` in
   apps/web/src/hooks/useTestingOrgAssignments.ts:8-137. It currently maps
   assignments by `batch_id` and then fetches one `active_batches` parent row,
   which collapses two bags from one batch into one entry and reports aggregate
   batch weight. It must keep every assignment row, fetch bags by
   `sub_batch_id`, fetch parent metadata separately, and return one entry per
   assignment. It must not resolve rows through `active_batches`, which drops
   zero-weight bags and would hide a consumed assignment.
7. Add exact-bag test query keys in apps/web/src/hooks/useBatchTests.ts. General
   history may stay batch-wide; Testing must use the assigned bag.

### Step 7: Make the web app compile

This is repair work, not redesign. The Testing inventory
(apps/web/src/routes/_private/inventory/-components/testing.tsx and
BatchTableRow/Testing.tsx) loses its process action and its assignment-type
display, and must render one row per assignment rather than per batch —
BatchFiltersContext.tsx:24-32,139-145 keys assignments by `batch_id` and has to
change. BatchTableRow/Common/index.tsx:442-451 renders every bag in the parent
row and must be filtered to the assigned bag for Testing.

apps/web/src/components/tests/QualityTestForm.tsx:219-356 already carries a
`subBatchId` but fetches every parent bag and lets a Testing user pick a
sibling; fix it to a single bag when one is supplied. ReturnBatchModal.tsx:34-70
loses its subsample fields and must not offer return for a `consumed`
assignment.

With the modal deleted in Step 1, `useAssignmentMode.ts` and
`CompleteAssignmentButton` have no consumer. Delete them and leave a clean seam
for the new UI.

Acceptance: two active assignments on two bags of one parent render as two rows,
each with its own bag weight and actions, and no `Map` keyed only by `batch_id`
remains anywhere in the Testing inventory path.

Verify:

    pnpm --filter=@nasti/web exec tsc -b
    pnpm --filter=@nasti/web exec vitest run
    pnpm --filter=@nasti/web build
    pnpm --filter=@nasti/web exec eslint <changed paths>

### Step 8: pgTAP coverage

Follow the fixture, JWT, role, `throws_ok`, `lives_ok`, `results_eq`, `finish`,
and rollback conventions in supabase/tests/testing_organisation_assignments.sql
and supabase/tests/sub_batch_merge.sql. Put multi-bag fixtures in a new
supabase/tests/sub_batch_testing_assignments.sql and keep organisation-link and
privilege contracts in the existing file.

Assignment and custody:

- two bags from one parent in one request, and two active assignments on one
  parent; the same bag rejected twice;
- a sample request splitting the source bag and assigning the child, with
  weights conserved;
- sample weight validated against that bag's current weight, after adjustments;
- assigning a bag leaving siblings' `held_by_org_id` untouched, and writing no
  `batch_custody` row;
- the assigned bag losing its storage row on assignment;
- General Admin succeeds, General Member is rejected.

Direct-write denial (Step 3):

- an owner's direct `UPDATE`/`DELETE` on a Testing-held bag is rejected;
- an owner's direct `UPDATE` of `held_by_org_id` on any bag is rejected;
- an owner's direct `batch_weight_adjustments` insert against a Testing-held bag
  is rejected;
- an owner's direct `batch_storage` insert/update against a Testing-held bag is
  rejected;
- a Testing user's direct `tests` insert for a sibling bag is rejected;
- a direct `treatments` insert is rejected;
- the assign, split, test, and return RPCs all still succeed.

Consuming operations (Step 3):

- General cannot clean, merge, or delete a batch or bag while one of its bags is
  assigned;
- no active assignment can be left pointing at deleted material.

Visibility — assert every cell of the access-model table, for General owner,
General member, Testing admin, Testing member, both while active and after
close, covering the assigned bag, siblings, the retained bag, parent metadata,
tests, containers, storage locations, and the closed assignment row.

Lifecycle:

- a quality test succeeds for the assigned bag and completes only that
  assignment; a sibling test fails and leaves state unchanged;
- consuming exactly the remaining weight succeeds and closes the assignment as
  `consumed`; over-consumption rolls back both the test and the adjustment;
- a `consumed` assignment cannot be returned;
- Testing splitting an assigned bag: the child is held by Testing and survives
  the return of its parent bag;
- returning one assignment leaves another bag's assignment active, sets
  `outcome = 'returned'`, and restores `held_by_org_id` to the owner;
- closed assignments remove access.

Weights and privileges:

- custody-relative weights: General's view of a batch excludes a bag held by
  Testing, and Testing's view excludes the siblings;
- malformed and partially valid multi-bag requests roll back all writes;
- no direct assignment-table mutation;
- new RPCs are not executable by PUBLIC or anon.

### Step 9: Handoff

The user applies everything with `supabase db reset` against an adjusted
`seed.sql`, so there is no catch-up script to write. Instead:

1. State plainly which migrations were edited and what each change does, so the
   reset can be reviewed rather than merely run.
2. Call out any `seed.sql` adjustment the new schema requires — a reset cannot
   infer one, and it is the only manual step left. `sub_batches` gaining a
   `NOT NULL held_by_org_id` is the likely candidate, though the BEFORE INSERT
   trigger should cover seed rows that omit it.
3. Ask the user to run `supabase db reset`, `pnpm test:db` and `pnpm gen-types`,
   and report back.
4. Confirm afterwards that a fresh reset leaves exactly one bag-based RPC
   contract, no executable batch-only assignment path, and no orphaned columns
   or indexes.
5. Update the plans/README.md status row.

## Done criteria

- [ ] Every assignment has a non-null `sub_batch_id` and matching `batch_id`;
      no batch-only assignment path remains.
- [ ] Different bags in one parent can be active simultaneously; one bag cannot.
- [ ] Sending a sample splits the source bag and assigns the child atomically.
- [ ] `sub_batches.held_by_org_id` is the sole custody answer, defaulted by
      trigger, maintained by split, merge, assign and return, and not directly
      writable by `authenticated`.
- [ ] No new `batch_custody` rows are written by assignment or return.
- [ ] Every access-model table cell is asserted by a passing pgTAP test.
- [ ] No assignment-related read or write policy authorises by parent batch
      alone; `rg` confirms it.
- [ ] Cleaning, merging and deletion are rejected while a bag is assigned.
- [ ] A test cannot consume more than the bag holds; zeroing a bag closes the
      assignment as `consumed`; a consumed assignment cannot be returned.
- [ ] `has_active_testing_assignment` has no call sites at all.
- [ ] No live code path reads `returned_at`. The name survives only in
      `20251114000005` (where the column is created), in the rename at the top
      of `20260804000001`, and inside three policies that are dropped before the
      rename runs — see "Implementation notes" below.
- [ ] Direct `treatments` writes are rejected.
- [ ] Testing sees the container name of the bag it holds and no
      `storage_locations` row.
- [ ] Displayed batch weight counts only bags in the viewer's custody.
- [ ] `fn_treat_batch` and the treatment UI are gone; `treatments` and its views
      still resolve.
- [ ] `organisation_link` and link requests have no capability columns, and no
      web consumer references them.
- [ ] Edge wrappers accept bag payloads only.
- [ ] Two assignments on one parent render as two rows in the Testing inventory.
- [ ] `pnpm test:db` exits 0 (user-run).
- [ ] `pnpm gen-types` produces types carrying `sub_batch_id` (user-run).
- [ ] `pnpm --filter=@nasti/web exec tsc -b`, `vitest run`, targeted eslint, and
      `build` all exit 0.
- [ ] `git diff --check` exits 0.
- [ ] Only scoped files are modified; the unrelated user changes are preserved.
- [ ] plans/README.md status row is updated.

## STOP conditions

Stop and report if:

- The stakeholder discussion reopens the retained-bag ownership decision, or
  asks for treatments removal beyond dropping the RPCs.
- Removing `fn_treat_batch` or the link capability columns breaks a view,
  policy, or publication not listed in this plan.
- Making the weight views caller-relative breaks PowerSync or a non-authenticated
  reader.
- A Testing organisation can only reach its bag through a parent aggregate that
  also exposes siblings.
- Bag custody cannot be maintained through split or merge without mutating a bag
  the caller does not hold.
- A consuming operation cannot be made bag-grained without changing a signature
  the generated types or web client depend on.
- Generated types expose a different signature after `pnpm gen-types`; never
  hand-edit database.ts.
- Any verification command fails twice after a reasonable correction.
- A required change touches the unrelated user-modified files or any
  out-of-scope file.
- Cited current-state code has drifted enough that this plan no longer
  identifies the same behavior.

## Maintenance notes

- `batch_id` on an assignment is a denormalised parent lookup key, not the
  physical unit. Keep it until historical consumers are bag-aware.
- `batch_custody` and `is_current_custodian`'s name are both intentionally
  stale. A follow-up can drop the table and rename the function; doing it here
  would bury the assignment change under a forty-call-site rename.
- Bag splitting, merging, cleaning and deletion **reject** rather than resolve
  an active assignment. If a future workflow needs to move an assignment to a
  successor bag, it must do so in the same transaction and never leave one
  pointing at zero-weight or deleted material.
- Review every RLS policy against both the parent batch's owner and the bag's
  holder, on read **and** write. A batch-only predicate leaks siblings on read
  and hands the owner power over Testing-held bags on write.
- Correcting a mis-recorded consumption currently requires hand-inserting a
  compensating weight adjustment. A manual correction path is a planned
  follow-up.
- Review the unrelated permissions changes independently; this plan does not
  modify them.

## Implementation notes from execution

Discovered while implementing Steps 2-5; recorded because they contradict
instructions given earlier in this plan.

**The `returned_at` → `closed_at` rename cannot happen in `20251114000005`.**
Four policies created between that migration and `20260804000001` name
`bta.returned_at` in their `USING` clauses, and a policy expression is
name-resolved at `CREATE POLICY` time —
`20251114000006_testing_org_rls.sql:311`,
`20251120000001_update_batch_rls_for_testing_orgs.sql:27,57`, and
`20251120000002_update_species_rls_for_testing_orgs.sql:26`. The column keeps
its original name where it is created and is renamed at the top of
`20260804000001`. This is safe because all four of those policies are dropped in
`20260723000005_rls_perf_rewrite.sql`, which runs before the rename; none
survives to reference either name.

**A column-level `REVOKE UPDATE (held_by_org_id)` does not work.** PostgreSQL
will not let a column-level revoke carve a hole in a table-level grant, and
Supabase grants `authenticated` table-level UPDATE by default. The lockdown is
`REVOKE UPDATE ON public.sub_batches FROM authenticated` followed by an explicit
`GRANT UPDATE (…)` naming every other column. **Any column added to
`sub_batches` in future must be added to that grant or it becomes silently
read-only.**

**`sub_batches_insert` cannot gate on `is_current_bag_custodian`.** An INSERT
`WITH CHECK` runs before the row exists, so a predicate that looks the bag up by
`id` finds nothing and denies every insert. It gates on
`held_by_org_id = get_user_organisation_id()` instead, which works because the
`BEFORE INSERT` trigger has already populated the column. `sub_batches_update`
carries the same `WITH CHECK`, which is what actually stops a holder handing a
bag to another organisation.

**`can_read_sub_batch` is `LANGUAGE plpgsql`, deliberately.** It reads
`batch_testing_assignment.sub_batch_id`, a column added in a later migration. A
`LANGUAGE sql` body is name-resolved at creation and would fail the reset;
plpgsql resolves at call time. Nothing evaluates an RLS predicate in between,
because migrations run as the table owner.

**The live `fn_clean_sub_batch` is in `20260728000002`, not `20260728000001`.**
The definition this plan cited at `20260728000001:483` is dropped and replaced by
a nine-argument version at `20260728000002_batch_cleaning_workers_duration.sql:211`.
Both copies now carry the bag-custody gate and the active-assignment rejection.

**The seeded assignment row in `supabase/seed.sql` was rewritten** to name the
50g bag `efe5355a-…` — the bag the seeded quality test was already recorded
against — and to carry `outcome = 'returned'`. `sub_batches` seed rows need no
`held_by_org_id`: the default trigger is declared `ENABLE ALWAYS` so it still
fires under `session_replication_role = replica`.

**Return closes the bag's storage row.** Assignment takes a bag off the sender's
shelf; return does the same on the Testing side, through
`fn_set_sub_batch_storage(bag, NULL, …)` while Testing still holds the bag and
so still passes that RPC's custody gate. Without it a returned bag points at a
storage location its new holder cannot resolve.

**`fn_return_bag_from_testing` no longer back-fills `completed_at`.** The old
function set `completed_at = COALESCE(completed_at, now())` on return, which
made an untested returned bag claim a test that never happened. `completed_at`
means "first test recorded" and nothing else.

## Reviewer findings: resolution

Findings raised 2026-08-06 and their disposition. All eight were checked against
the code before being accepted.

| ID | Disposition | Where it landed |
|---|---|---|
| REVIEW-01 | Accepted in substance, narrowed in scope | Access model table added. Blocking applies to Steps 2-9; Step 1 is pure removal and does not depend on the decision. |
| REVIEW-02 | Accepted | New Step 3, plus the `held_by_org_id` column REVOKE in Step 2 and the direct-write denial tests in Step 8. |
| REVIEW-03 | Accepted | Step 3, "Operations that consume, delete, or merge". Rejection chosen over auto-close. |
| REVIEW-04 | Accepted in part | Over-consumption guard added to Step 5. The "zero-weight assignment stays returnable" requirement was rejected: a fully consumed bag has nothing to return. Replaced by the `closed_at`/`outcome` lifecycle in decision 7 and Step 4. |
| REVIEW-05 | Accepted | Step 5 names `collection_select` and `species_select` explicitly, with an `rg` check. |
| REVIEW-06 | Accepted | `useTestingOrgs.ts` added to Step 1; Scope now states the branch ships without assignment creation by design and must not reach a deployed environment before the replacement UI. |
| REVIEW-07 | Accepted | Step 9 rewritten with drop order, full signatures for overloaded functions, and a backfill rather than an empty-database assumption. |
| REVIEW-08 | Accepted | Step 1 replaces `treatments_all` with a SELECT-only policy; denial test in Step 8. |

One finding neither the plan nor the review caught, now covered in Step 3:
`batch_weight_adjustments_select` is batch-grained, and `sub_batch_current_weight`
is `security_invoker`. Left alone, a Testing organisation would read its own
bag's original weight in place of its current weight — silently wrong, and the
number the quality-test form validates against.
