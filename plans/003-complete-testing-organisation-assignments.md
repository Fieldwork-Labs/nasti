# Plan 003: Complete and secure testing-organisation assignments

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report—do not improvise. When done, update the status row for this plan in
> `plans/README.md`, unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat cde7c95..HEAD -- \
>   apps/web/src/components/inventory/modals/AssignBatchesForTestingModal.tsx \
>   apps/web/src/components/testing-orgs \
>   apps/web/src/components/tests \
>   apps/web/src/hooks/useAssignBatchesForTesting.ts \
>   apps/web/src/hooks/useBatchAssignments.ts \
>   apps/web/src/hooks/useBatches.ts \
>   apps/web/src/hooks/useBatchTests.ts \
>   apps/web/src/hooks/useTestingOrgAssignments.ts \
>   apps/web/src/hooks/useTestingOrgs.ts \
>   apps/web/src/routes/_private/inventory \
>   packages/common/types/database.ts \
>   supabase/config.toml \
>   supabase/functions/assign_batches_for_testing \
>   supabase/functions/return_batch_from_testing \
>   supabase/migrations \
>   supabase/tests
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. If custody,
> assignment status, or the latest treatment function no longer matches this
> plan, treat that as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none; Plan 001 is already complete
- **Category**: security, bug, migration, tests
- **Planned at**: commit `cde7c95`, 2026-07-29

## Why this matters

NASTI models testing providers as organisations linked to seed-owning
organisations. The current implementation can create links and assignment
records, but a full-batch assignment does not transfer custody, returning an
assignment does not transfer custody back, completed/returned status does not
drive the testing dashboard, and current RLS permits mutation paths that bypass
the validated edge functions.

The most urgent defect is the current numeric-signature `fn_treat_batch`: it is
`SECURITY DEFINER`, has no caller/custody check, and is executable by `anon` in
the effective local database. A caller with a batch UUID can therefore invoke a
state-changing treatment outside RLS.

After this plan lands, assignment, full-batch custody transfer, return, test
completion, and treatment propagation will be atomic database operations.
Direct table writes will not bypass their invariants, returned assignments will
no longer grant batch access, and the testing UI will be backed by assignment
status rather than the general inventory query.

## Locked domain decisions

These decisions are part of this plan and must remain consistent across the
database, edge functions, and UI:

1. `batches.organisation_id` is the owning General organisation. Temporary
   custody does not change ownership.
2. A `sample` assignment does not change batch custody. It grants the linked
   Testing organisation temporary read/test access while `returned_at IS NULL`.
3. A `full_batch` assignment appends a `batch_custody` row transferring current
   custody to the Testing organisation. Returning it appends another custody row
   transferring current custody to `assigned_by_org_id`.
4. At most one assignment may be active for a batch. "Active" means
   `returned_at IS NULL`.
5. The first successful quality test performed by the assigned Testing
   organisation sets `completed_at` in the same transaction. There is no
   separate user action required to complete a tested assignment.
6. Returning an untested assignment remains allowed; return closes the
   assignment and sets `completed_at` if necessary, matching current behavior.
7. The owning organisation may always read its batch. A current custodian may
   read and mutate it. A Testing organisation with an active sample assignment
   may read the batch and its sub-batches and create tests, but may not run
   custody-only processing operations.
8. Once `returned_at` is set, the Testing organisation loses assignment-derived
   access to the batch, collection, species, and sub-batches. Tests it performed
   remain visible through the existing `performed_by_organisation_id` rule.
9. When treatment produces a successor batch during an active full-batch
   assignment, the successor keeps the General organisation as owner, inherits
   the input batch's current custodian, and the existing assignment follows the
   successor by updating its `batch_id`. Do not create a second active
   assignment for the output.
10. Retained QA subsamples remain metadata on
    `batch_testing_assignment` in this plan. Do not introduce a new physical
    sample/batch entity without a separate product decision.

## Current state

### Relevant files

- `supabase/functions/assign_batches_for_testing/index.ts` — validates link
  permissions and inserts assignment rows, but performs no custody write.
- `supabase/functions/return_batch_from_testing/index.ts` — updates assignment
  timestamps and optional retained-subsample metadata, but performs no custody
  write.
- `supabase/migrations/20260723000005_rls_perf_rewrite.sql` — contains the
  effective batch, assignment, test, sub-batch, and custody RLS policies.
- `supabase/migrations/20260728000001_numeric_weights.sql` — contains the latest
  numeric-signature `fn_treat_batch` and `fn_create_quality_test`.
- `supabase/migrations/20260729000001_storage_relationship_tenancy.sql` —
  enforces that storage containers and locations belong to the current
  custodian; custody changes must remain compatible with these triggers.
- `apps/web/src/hooks/useTestingOrgAssignments.ts` — already contains
  pending/completed assignment queries, plus a dead call to a nonexistent
  `complete_testing_assignment` edge function.
- `apps/web/src/hooks/useBatches.ts` — powers both organisation types through
  `active_batches`; it ignores the Testing UI's `pending` and `completed`
  statuses.
- `apps/web/src/routes/_private/inventory/-components/testing.tsx` and
  `BatchTableRow/Testing.tsx` — render a testing-specific inventory shell but
  consume the general batch query.
- `apps/web/src/components/inventory/modals/AssignBatchesForTestingModal.tsx` —
  supports mixed sample/full assignments but reverses the link-permission
  predicate.
- `apps/web/src/hooks/useTestingOrgs.ts` and
  `apps/web/src/components/testing-orgs/TestingOrgLinks.tsx` — fetch both sides
  of the link, but the Testing view renders its own organisation name instead
  of the requesting General organisation.
- `supabase/tests/rls_contracts.sql` — current pgTAP structural checks; its seed
  collector assertion expects three rows while the current seed contains four,
  so the repository's database test command is red before this work begins.

### Assignment is not a custody transfer

At `supabase/functions/assign_batches_for_testing/index.ts:214-231`, the final
state change is only an assignment insert:

```ts
const assignmentRecords = batchAssignments.map((assignment) => ({
  batch_id: assignment.batch_id,
  assigned_to_org_id: testing_org_id,
  assigned_by_org_id: userOrgId,
  assignment_type: assignment.assignment_type,
  sample_weight_grams:
    assignment.assignment_type === "sample"
      ? assignment.sample_weight_grams
      : null,
}))

await supabaseClient
  .from("batch_testing_assignment")
  .insert(assignmentRecords)
```

At `supabase/functions/return_batch_from_testing/index.ts:147-175`, return only
updates the assignment:

```ts
const updateData = {
  returned_at: new Date().toISOString(),
}

if (!assignment.completed_at) {
  updateData.completed_at = new Date().toISOString()
}

await supabaseClient
  .from("batch_testing_assignment")
  .update(updateData)
  .eq("id", assignment_id)
```

Neither path inserts `batch_custody`, despite
`testing_org_plan.md:145-175` requiring custody transfer for `full_batch`
assignments and transfer back on return.

### Direct assignment writes bypass edge-function validation

At `supabase/migrations/20260723000005_rls_perf_rewrite.sql:521-537`, any
General admin can insert an assignment without proving a valid link, and a
Testing admin can update every column of an assignment addressed to its
organisation:

```sql
CREATE POLICY batch_testing_assignment_insert
  ON public.batch_testing_assignment
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), assigned_by_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );

CREATE POLICY batch_testing_assignment_update
  ON public.batch_testing_assignment
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member((SELECT auth.uid()), assigned_to_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  )
  WITH CHECK (
    public.is_org_member((SELECT auth.uid()), assigned_to_org_id)
    AND (SELECT public.auth_org_role()) = 'Admin'
  );
```

These policies do not enforce link permissions, immutable organisation/batch
identity, assignment type, or a controlled state transition.

### Returned assignments still grant batch access

At `supabase/migrations/20260723000005_rls_perf_rewrite.sql:278-292`,
assignment-derived batch access has no `returned_at IS NULL` predicate:

```sql
CREATE POLICY batches_select ON public.batches
  FOR SELECT TO authenticated
  USING (
    public.is_batch_custodian_or_past((SELECT auth.uid()), id)
    OR EXISTS (
      SELECT 1 FROM public.batch_testing_assignment bta
      WHERE bta.batch_id = batches.id
        AND public.is_org_member((SELECT auth.uid()), bta.assigned_by_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.batch_testing_assignment bta
      WHERE bta.batch_id = batches.id
        AND public.is_org_member((SELECT auth.uid()), bta.assigned_to_org_id)
    )
  );
```

The historical-custodian branch also makes every former custodian a permanent
reader. Replace this broad rule with explicit owner/current-custodian/active
assignment cases; do not use historical custody as the general batch-read
boundary.

### Treatment is exposed and does not preserve temporary custody

At `supabase/migrations/20260728000001_numeric_weights.sql:1151-1178`,
`fn_treat_batch` reads the requested batch without validating `auth.uid()` or
current custody. At lines 1233-1234 it assigns output custody to the owning
organisation rather than the current custodian:

```sql
INSERT INTO batch_custody (batch_id, organisation_id, notes)
VALUES (v_output_batch_id, v_organisation_id, 'Batch created via treating');
```

At lines 1283-1301 it copies an active assignment to the output, leaving the
input assignment active:

```sql
INSERT INTO batch_testing_assignment (...)
SELECT v_output_batch_id, ...
FROM batch_testing_assignment bta
WHERE bta.batch_id = p_input_batch_id
  AND bta.returned_at IS NULL;
```

The function ends with `SECURITY DEFINER` and grants `authenticated` execution,
but does not revoke the default `PUBLIC` privilege for the new numeric
signature. The effective local database confirms both `anon` and
`authenticated` can execute it.

### Testing status and actions are disconnected

`apps/web/src/hooks/useTestingOrgAssignments.ts:24-86` contains the correct
assignment-derived queries:

```ts
.eq("assigned_to_org_id", organisation.id)
.is("returned_at", null)

if (status === "pending") {
  q = q.is("completed_at", null)
} else {
  q = q.not("completed_at", "is", null)
}
```

However `apps/web/src/hooks/useBatches.ts:91-111`, which feeds the Testing page,
only understands General inventory statuses:

```ts
if (batchFilter.status === "unprocessed") {
  q = q.is("is_treated", false).is("is_cleaned", false)
} else if (batchFilter.status === "processed") {
  q = q.or("is_treated.is.true,is_cleaned.is.true")
}
```

The Testing row also renders a toolbar quality-test button whose
`onOpenQualityTest` handler is never supplied, while sub-batch testing depends
on the sub-batches being visible.

### Permission filtering is reversed

At
`apps/web/src/components/inventory/modals/AssignBatchesForTestingModal.tsx:190-201`:

```ts
const availableOrgs = organisationLinks?.filter((link) => {
  if (link.can_process && link.can_test) return true
  else if (link.can_process) return hasSamples
  else if (link.can_test) return hasFullBatches
})
```

The correct mapping is `can_test → sample` and
`can_process → full_batch`. For a mixed selection, the selected organisation
must satisfy every required capability, not merely one of them.

## Target architecture

### Atomic database functions

Create security-definer RPCs in a new timestamped migration and make them the
only mutation boundary for assignments:

1. `fn_assign_batches_for_testing(p_testing_org_id uuid, p_assignments jsonb)`
   returns the created assignment rows or their IDs.
2. `fn_return_batch_from_testing(p_assignment_id uuid,
   p_subsample_weight_grams numeric default null,
   p_subsample_storage_location_id uuid default null)` returns the updated
   assignment.

Both functions must:

- require `auth.uid()` and an active organisation membership;
- require the caller's Admin role for assignment/return operations;
- use `SECURITY DEFINER SET search_path = ''`;
- qualify all relation names with `public`;
- revoke execution from `PUBLIC` and `anon`;
- grant execution only to `authenticated`;
- lock affected assignment/batch rows before checking state;
- validate everything before the first write;
- rely on one PostgreSQL transaction, so assignment and custody never diverge;
- raise stable, specific exception messages that the edge wrappers can map to a
  400, 403, 404, or 409 response.

The edge functions remain the public web interface but become thin wrappers:
authenticate, validate JSON shape, call one RPC, and translate the result/error.
They must not duplicate database authorization decisions or perform multi-write
state transitions themselves.

### Assignment invariants

The new migration must add:

```sql
CREATE UNIQUE INDEX ... ON public.batch_testing_assignment(batch_id)
WHERE returned_at IS NULL;
```

The assignment RPC must:

- reject an empty array, duplicate batch IDs, unknown batches, and duplicate
  active assignments;
- lock batches in deterministic UUID order to prevent concurrent double
  assignment;
- require the caller's organisation to be both the batch owner and current
  custodian at assignment time;
- require the target organisation to have `type = 'Testing'`;
- require an accepted `organisation_link`;
- require `can_test` for every sample and `can_process` for every full batch;
- require `0 < sample_weight_grams < current batch weight` for samples;
- insert one assignment per input;
- append a custody row only for each `full_batch`, with
  `previous_organisation_id = assigned_by_org_id` and
  `transferred_by = auth.uid()`;
- append no custody row for a sample.

The return RPC must:

- require the caller to be an Admin of `assigned_to_org_id`;
- reject a missing or already-returned assignment;
- validate a positive retained-subsample weight and an active storage location
  belonging to the Testing organisation when retention metadata is supplied;
- require weight and location together, or neither;
- ensure retained weight does not exceed the assignment's sample weight for a
  sample assignment;
- for `full_batch`, require the caller's organisation to be the current
  custodian, then append custody back to `assigned_by_org_id`;
- for `sample`, append no custody row;
- set `returned_at` and, if null, `completed_at` using one shared timestamp.

### RLS and privileges

Keep SELECT policies for audit/history, but remove authenticated
INSERT/UPDATE/DELETE policies from `batch_testing_assignment`. All mutations
must go through the RPCs.

Replace the batch SELECT rule with explicit cases:

- `batches.organisation_id = get_user_organisation_id()` — owner access;
- current custody belongs to the caller's organisation;
- an active assignment (`returned_at IS NULL`) is addressed to the caller's
  Testing organisation.

Do not grant batch access solely because an organisation appears in historical
custody or a returned assignment.

Update dependent SELECT policies so active assignment recipients can read only
what is required:

- `collection` and `species` for an actively assigned batch;
- `sub_batches` for the owner, current custodian, or active assignment
  recipient;
- `batch_custody` history for the batch owner or current custodian;
- assignment rows for `assigned_by_org_id` and `assigned_to_org_id`, including
  returned history;
- tests under the existing owner/current-custodian/performing-organisation
  model.

Keep sub-batch INSERT/UPDATE/DELETE and all processing/storage mutations
restricted to the current custodian. Remove direct authenticated UPDATE and
DELETE policies from `batch_custody`; custody history is append-only and new
rows are created only inside the secured workflow/processing RPCs.

### Quality-test completion

Update the latest `fn_create_quality_test` through a new migration:

- retain its existing caller-organisation and assignment authorization checks;
- after inserting a quality test, set `completed_at` on the one active
  assignment for `p_batch_id` and the performing organisation when it is null;
- perform the test insert, consumed-weight adjustment, and assignment completion
  in one transaction;
- retain its existing `PUBLIC`/`anon` revocation.

Delete the dead `useCompleteAssignment` client mutation. Do not create a manual
completion edge function unless the product owner explicitly changes locked
decision 5.

### Treatment hardening and assignment propagation

Replace `fn_treat_batch` in a new migration without changing its public
parameter signature:

- require `auth.uid()` and active membership;
- require the caller to be the current custodian of `p_input_batch_id`;
- lock the input batch and its active assignment;
- validate positive input/output weights and existing treatment-array rules;
- preserve `batches.organisation_id` as the owner on the output;
- assign output `batch_custody` to the input's current custodian;
- if an active `full_batch` assignment exists for the current custodian,
  update that assignment's `batch_id` to the output ID instead of inserting a
  duplicate assignment;
- reject treatment under a `sample` assignment;
- revoke execution from `PUBLIC` and `anon`, grant only `authenticated`, and add
  an explicit pgTAP privilege assertion for the numeric signature.

### Testing dashboard

Make assignment status the Testing organisation inventory source:

- Pending: `completed_at IS NULL AND returned_at IS NULL`.
- Completed/QA: `completed_at IS NOT NULL AND returned_at IS NULL`.
- Returned rows are absent from both lists.

Use the existing `useAssignmentsByStatus` shape, but fetch all referenced
`active_batches` rows in one batched query and merge by `batch_id`; do not issue
one batch query per assignment. Keep search, species, location, sort, loading,
empty, and error states.

The Testing row must:

- show the sending General organisation, assignment type, sent weight/full
  weight, assigned date, and completed date when applicable;
- allow quality testing only when a readable sub-batch is selected;
- show processing only for `full_batch` assignments with current custody;
- never offer delete;
- allow return only for an active assignment;
- remove the inert toolbar quality-test button or wire it to an explicit
  sub-batch selection dialog;
- invalidate assignment, batch, sub-batch, and test query keys after mutations.

Correct link display names in `TestingOrgLinks.tsx` to use `general_org.name`.
Use explicit type fields such as `general_org_name`; do not continue overloading
`testing_org_name` with the opposite side of the relationship.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Start database | `supabase start` | exit 0; local services reported running |
| Rebuild database | `supabase db reset` | exit 0; all migrations and seed apply |
| Generate database types | `pnpm gen-types` | exit 0; generated RPC signatures and schema changes are present |
| Database tests | `pnpm test:db` | exit 0; all pgTAP files pass |
| Focused web tests | `pnpm --filter=@nasti/web exec vitest run src/lib/__tests__/testingAssignments.test.ts` | exit 0; all new assignment helper tests pass |
| Web typecheck | `pnpm --filter=@nasti/web exec tsc -b` | exit 0; no errors |
| Targeted lint | See command below | exit 0; no errors |
| Web production build | `pnpm --filter=@nasti/web build` | exit 0 |
| Diff hygiene | `git diff --check` | exit 0; no output |

Use this targeted lint command rather than root `pnpm lint`, because generated
`apps/web/.wrangler` output can produce unrelated failures:

```bash
pnpm --filter=@nasti/web exec eslint \
  src/components/inventory/modals/AssignBatchesForTestingModal.tsx \
  src/components/testing-orgs \
  src/components/tests \
  src/hooks/useAssignBatchesForTesting.ts \
  src/hooks/useBatchAssignments.ts \
  src/hooks/useBatches.ts \
  src/hooks/useBatchTests.ts \
  src/hooks/useTestingOrgAssignments.ts \
  src/hooks/useTestingOrgs.ts \
  src/lib/testingAssignments.ts \
  src/lib/__tests__/testingAssignments.test.ts \
  src/routes/_private/inventory
```

If the workspace package manager reports a lockfile-version mismatch, use the
repository-declared `pnpm@8.10.5` through Corepack. Do not delete or regenerate
the lockfile as part of this plan.

## Scope

**In scope**:

- Create one or more forward-only migrations under `supabase/migrations/` for:
  - atomic assignment/return RPCs and active-assignment uniqueness;
  - assignment and related read-policy hardening;
  - numeric `fn_treat_batch` authorization/custody propagation;
  - quality-test assignment completion.
- Create `supabase/tests/testing_organisation_assignments.sql`.
- Update `supabase/tests/rls_contracts.sql`.
- Regenerate `packages/common/types/database.ts`.
- Update:
  - `supabase/functions/assign_batches_for_testing/index.ts`;
  - `supabase/functions/return_batch_from_testing/index.ts`;
  - `apps/web/src/hooks/useAssignBatchesForTesting.ts`;
  - `apps/web/src/hooks/useBatchAssignments.ts`;
  - `apps/web/src/hooks/useBatches.ts`;
  - `apps/web/src/hooks/useBatchTests.ts`;
  - `apps/web/src/hooks/useTestingOrgAssignments.ts`;
  - `apps/web/src/hooks/useTestingOrgs.ts`;
  - `apps/web/src/components/inventory/modals/AssignBatchesForTestingModal.tsx`;
  - `apps/web/src/components/testing-orgs/TestingOrgLinks.tsx`;
  - `apps/web/src/components/tests/ReturnBatchModal.tsx`;
  - `apps/web/src/routes/_private/inventory/index.tsx`;
  - files under
    `apps/web/src/routes/_private/inventory/-components/` needed to give Testing
    organisations an assignment-backed provider/page/row.
- Create:
  - `apps/web/src/lib/testingAssignments.ts`;
  - `apps/web/src/lib/__tests__/testingAssignments.test.ts`;
  - narrowly scoped Testing dashboard components if the current batch-row
    component cannot express assignment status without General-inventory
    conditionals.
- Update `plans/README.md` status when complete.

**Out of scope**:

- Editing historical migration files. All database changes must be new,
  forward-only migrations.
- Creating Testing organisations or onboarding them through the UI; they remain
  site-admin-created.
- Changing link-request email delivery or Mailgun configuration.
- Replacing `organisation_link` / `organisation_link_request` with a different
  relationship model.
- Creating a new physical retained-sample entity or supporting split custody
  below batch level.
- Mobile or PowerSync support; assignment processing is currently office-web
  functionality.
- General inventory processing, cleaning, split, merge, bagging, container, or
  storage redesigns except where `fn_treat_batch`, access policy, or custody
  propagation must change for an active full-batch assignment.
- Rewriting generated `routeTree.gen.ts` by hand.
- Changing public environment variables or deployment infrastructure.

## Git workflow

- Branch: `feat/complete-testing-org-assignments`
- Use Conventional Commits. Suggested logical commits:
  1. `test: characterize testing organisation assignments`
  2. `fix: secure testing assignment and custody functions`
  3. `feat: complete testing assignment inventory workflow`
- Do not push or open a pull request unless explicitly instructed.

## Steps

### Step 1: Establish a green characterization-test baseline

Create `supabase/tests/testing_organisation_assignments.sql`. Follow the
`begin`, pgTAP extension, `plan`, fixture, JWT/role, `finish`, and `rollback`
conventions in the existing database tests.

First repair the unrelated stale assertion in `supabase/tests/rls_contracts.sql`
without hard-coding the new seed count. Replace the assertion that exactly
three collections identify a collector with an invariant such as "no seeded
collection for the target organisation has an empty `person_ids` array."

Add failing characterization cases for:

1. `anon` cannot execute the numeric-signature `fn_treat_batch`.
2. A non-admin General member cannot assign a batch.
3. An unlinked Testing organisation cannot receive an assignment.
4. `can_test` permits samples but not full batches.
5. `can_process` permits full batches but not samples.
6. A mixed request requires both permissions.
7. Direct authenticated INSERT/UPDATE/DELETE on
   `batch_testing_assignment` is rejected.
8. Direct authenticated UPDATE/DELETE on `batch_custody` is rejected.
9. Two concurrent/logically duplicate active assignments for one batch are
   rejected.
10. A sample assignment leaves custody with the owner.
11. A full-batch assignment transfers custody to the Testing organisation.
12. Returning a full batch restores custody to the General organisation.
13. Returning a sample creates no custody rows.
14. A returned assignment does not grant batch or sub-batch SELECT to the
    Testing organisation.
15. An active sample assignment grants batch/sub-batch read and quality-test
    creation, but not treatment.
16. Creating the first quality test sets assignment `completed_at`.
17. Repeating or editing tests does not create assignments or change
    `returned_at`.
18. Treatment under active full-batch custody creates an owner-preserving
    successor at the Testing custodian and moves, rather than duplicates, the
    assignment.

Use isolated UUID fixtures and database transactions. Assert table state,
current custody, privileges, and RLS results—not implementation strings alone.

**Verify**:

```bash
pnpm test:db
```

Expected before implementation: the repaired unrelated seed assertion passes;
new regression assertions fail only for the documented assignment/treatment
gaps.

### Step 2: Add atomic assignment and return RPCs

Create the forward migration implementing the target RPCs and unique partial
index. Lock rows deterministically and perform all validation before writes.
Return typed rows or IDs that the edge functions can serialize without
additional database fetches.

Drop the assignment table's client mutation policies. Do not grant table
mutation back to `authenticated`; the RPCs are the mutation boundary.

**Verify**:

```bash
supabase db reset
pnpm test:db
```

Expected after this step: assignment, permission, direct-write, uniqueness, and
custody transfer/return assertions pass. Treatment/completion/UI-dependent
assertions may remain pending until their steps.

### Step 3: Harden batch access and treatment propagation

Add the explicit owner/current-custodian/active-assignment SELECT rules and
dependent collection/species/sub-batch access described above. Replace
`fn_treat_batch` with the same parameter signature and secured behavior.

Pay particular attention to the storage-tenancy triggers: output sub-batches
with no container remain valid, but any destination storage/container selected
later must belong to the inherited current custodian.

**Verify**:

```bash
pnpm test:db
```

Expected: all returned-access, sample-vs-full authorization, anonymous
privilege, and treatment-propagation assertions pass.

Also run:

```bash
psql "$LOCAL_DATABASE_URL" -Atc \
  "select has_function_privilege('anon', 'public.fn_treat_batch(uuid,numeric,jsonb,public.batch_quality,numeric,text)', 'EXECUTE');"
```

Expected: exactly `f`. If `LOCAL_DATABASE_URL` is not already set by the
operator, use the database URL reported by `supabase status`; do not commit it
to a file.

### Step 4: Complete assignments atomically when tests are recorded

Replace `fn_create_quality_test` in a forward migration so test insertion,
consumed-weight adjustment, and `completed_at` update share one transaction.
Update only the active assignment addressed to the performing organisation.

Remove `useCompleteAssignment` from
`apps/web/src/hooks/useTestingOrgAssignments.ts`. Invalidate pending and
completed assignment queries from the successful quality-test mutation.

**Verify**:

```bash
pnpm test:db
pnpm --filter=@nasti/web exec tsc -b
```

Expected: all quality-test completion tests pass and the web app typechecks
without a reference to `complete_testing_assignment`.

### Step 5: Make edge functions thin RPC wrappers

Refactor both edge functions to:

- retain `AuthMiddleware`;
- explicitly reject methods other than `POST`/`OPTIONS`;
- validate the request JSON shape and numeric fields;
- call exactly one database RPC for the state transition;
- avoid fetching membership, links, custody, or assignments independently;
- map known database exceptions to stable HTTP responses;
- avoid returning internal stack traces or arbitrary database messages for
  unexpected failures.

Keep their current request and successful response shapes unless the generated
RPC result requires a documented, compatible normalization.

**Verify**:

```bash
rg -n '\\.from\\("(batch_testing_assignment|batch_custody|organisation_link)"\\)' \
  supabase/functions/assign_batches_for_testing/index.ts \
  supabase/functions/return_batch_from_testing/index.ts
```

Expected: no state-transition table writes; each function invokes its one RPC.

Then run:

```bash
pnpm --filter=@nasti/web exec tsc -b
```

Expected: exit 0.

### Step 6: Correct client permission and link-side semantics

Extract pure helpers in `apps/web/src/lib/testingAssignments.ts` for:

- determining whether a link supports all selected assignment types;
- deriving `pending`, `completed`, and `returned` status;
- deciding whether process/test/return actions are available.

Correct the assignment modal so:

- sample-only selections require `can_test`;
- full-only selections require `can_process`;
- mixed selections require both;
- a previously selected organisation is cleared if changing per-batch types
  makes it invalid.

Correct Testing-side link/request labels and types to use the General
organisation name.

Add unit tests for every permission combination and status transition.

**Verify**:

```bash
pnpm --filter=@nasti/web exec vitest run \
  src/lib/__tests__/testingAssignments.test.ts
```

Expected: all helper tests pass.

### Step 7: Back the Testing inventory with assignments

Refactor the inventory route/provider so General organisations continue using
`useBatchesByFilter`, while Testing organisations use active assignments joined
to batches in batched queries.

Implement the two status lists in the current `/inventory` route rather than
adding a second competing route:

- `pending` shows active incomplete assignments;
- `completed` shows active completed assignments;
- `any` shows both;
- returned assignments are excluded.

Preserve URL-driven search/sort/filter behavior. Show a specific error state
when assignment or batch queries fail; do not render "No Batches Found" for a
failed request.

Gate row actions from the assignment type and custody:

- quality test requires a selected visible sub-batch;
- process only for full-batch/current-custody;
- return only for active assignments;
- no Testing-side delete action.

After assign, test, treatment, and return, invalidate all affected assignment,
batch, sub-batch, and test query keys.

**Verify**:

```bash
pnpm --filter=@nasti/web exec tsc -b
pnpm --filter=@nasti/web exec eslint \
  src/components/inventory/modals/AssignBatchesForTestingModal.tsx \
  src/components/testing-orgs \
  src/components/tests \
  src/hooks/useAssignBatchesForTesting.ts \
  src/hooks/useBatchAssignments.ts \
  src/hooks/useBatches.ts \
  src/hooks/useBatchTests.ts \
  src/hooks/useTestingOrgAssignments.ts \
  src/hooks/useTestingOrgs.ts \
  src/lib/testingAssignments.ts \
  src/lib/__tests__/testingAssignments.test.ts \
  src/routes/_private/inventory
```

Expected: both commands exit 0 with no errors.

### Step 8: Regenerate types and run full verification

Regenerate types only after all migrations are final:

```bash
pnpm gen-types
```

Confirm the generated file contains the two assignment RPCs, the numeric
treatment signature, and any schema/index-related type changes. Do not hand-edit
`packages/common/types/database.ts`.

Run:

```bash
supabase db reset
pnpm test:db
pnpm --filter=@nasti/web exec vitest run \
  src/lib/__tests__/testingAssignments.test.ts
pnpm --filter=@nasti/web exec tsc -b
pnpm --filter=@nasti/web build
git diff --check
```

Expected: every command exits 0; pgTAP reports all files and assertions passing;
the focused Vitest file passes; the production web build succeeds; diff check
prints nothing.

Inspect scope:

```bash
git status --short
```

Expected: only files listed in this plan's in-scope section, generated route
artifacts produced by the build tooling when expected, and `plans/README.md`
are modified. Do not commit `.wrangler`, `dist`, a package-manager store, or
environment files.

## Test plan

### Database tests

Create `supabase/tests/testing_organisation_assignments.sql` with fixtures for
one General owner, two Testing organisations, Admin and Member users, links
with each permission combination, at least two batches with sub-batches, and
storage locations belonging to both organisations.

Cover:

- authentication and role boundaries;
- link/capability validation;
- active-assignment uniqueness and concurrency-safe behavior;
- sample versus full-batch custody;
- atomic rollback when any batch in a multi-assign request fails;
- return idempotency;
- retained-subsample validation;
- direct table-write rejection;
- append-only custody history;
- owner/current/active/returned RLS visibility;
- quality-test completion and consumed weight;
- treatment privilege revocation and assignment propagation.

Use `supabase/tests/sub_batch_storage.sql` and
`supabase/tests/storage_relationship_tenancy.sql` as patterns for fixture
isolation, JWT claims, RLS role switching, and transaction rollback.

### Web tests

Create a pure-helper Vitest file covering:

- every `can_test` / `can_process` × sample/full/mixed permission combination;
- pending, completed, and returned status derivation;
- process action only for active full-batch custody;
- quality-test action for active assignments;
- return action hidden after return.

Keep network/database behavior in pgTAP rather than heavily mocking Supabase in
React component tests.

## Done criteria

All must hold:

- [ ] `anon` and `PUBLIC` cannot execute numeric `fn_treat_batch`; only
      `authenticated` can.
- [ ] `fn_treat_batch` authenticates the caller and requires current custody.
- [ ] Direct authenticated clients cannot insert, update, or delete assignment
      rows.
- [ ] Direct authenticated clients cannot update or delete custody history.
- [ ] A partial unique index prevents two active assignments for one batch.
- [ ] Sample assignment leaves custody unchanged; full assignment transfers it.
- [ ] Full-batch return appends custody back to the owner; sample return does not
      append custody.
- [ ] Assignment and custody changes roll back together on every failure path.
- [ ] Returned assignments and historical Testing custody do not independently
      grant batch/sub-batch access.
- [ ] The owner can still read a batch while a Testing organisation has full
      custody.
- [ ] Active sample assignments can read required batch/sub-batch data and
      create tests, but cannot process the batch.
- [ ] First quality test sets `completed_at` atomically.
- [ ] Treatment moves one active full-batch assignment to its output and
      preserves owner/current-custodian separation.
- [ ] Testing inventory pending/completed filters are assignment-backed and
      exclude returned rows.
- [ ] Permission filtering maps `can_test` to sample and `can_process` to full
      batch, with mixed assignments requiring both.
- [ ] Testing link screens show the sending General organisation.
- [ ] `pnpm test:db`, focused Vitest, web typecheck, targeted lint, web build,
      and `git diff --check` all pass.
- [ ] `packages/common/types/database.ts` is regenerated, not hand-edited.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` marks Plan 003 `DONE`.

## STOP conditions

Stop and report back—do not improvise—if:

- Product stakeholders want sample assignments to transfer custody. The locked
  model and RLS design must be revisited first.
- Product stakeholders want retained QA samples to become independently
  movable physical inventory after the main batch returns. That requires a
  separate split-custody/sample entity design outside this plan.
- More than one simultaneous active assignment per batch is a genuine product
  requirement. Do not add the partial unique index until assignment identity
  and UI semantics are redesigned.
- A treatment operation is expected to create multiple independently assigned
  outputs. This plan assumes one treatment output and one assignment that
  follows it.
- Current production data contains duplicate active assignments. Stop with a
  report listing counts and affected IDs only; do not guess which assignment to
  retain.
- Current production custody history lacks a current row for assigned batches.
  Do not fabricate custody history without a reviewed data-migration rule.
- In-scope code has drifted so the excerpts or latest function signatures no
  longer match.
- A verification step fails twice after a reasonable correction.
- Completing the plan appears to require mobile/PowerSync schema changes,
  a new physical retained-sample entity, or editing historical migrations.

## Maintenance notes

- Treat `batch_testing_assignment` as a state machine. Future columns or actions
  should be mutated through RPCs, not broader table policies.
- Any new batch-producing operation used by Testing organisations must
  explicitly preserve owner, current custody, and the active assignment;
  treatment is the first covered example.
- Any RLS optimization must retain `returned_at IS NULL` on assignment-derived
  access and must not reintroduce historical custody as permanent read access.
- `batch_custody` history is append-only for this workflow. Do not update an old
  custody row to represent a transfer.
- Reviewers should scrutinize multi-batch atomicity, row-lock order, function
  privileges, and owner-vs-custodian semantics before UI polish.
- Retained QA samples remain metadata-only by design here. If they need to
  become inventory later, start with a domain-model plan rather than extending
  `subsample_weight_grams` ad hoc.
