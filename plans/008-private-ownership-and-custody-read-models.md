# Plan 008: Provide privacy-safe ownership and custody read models

> **Executor instructions**: Follow each step and verification gate. Stop on a
> STOP condition rather than widening access or exposing base tables as a
> shortcut. Update `plans/README.md` on completion unless a reviewer owns it.
>
> **Drift check (run first)**:
>
>     git diff --stat b447573..HEAD -- \
>       apps/web/src/hooks packages/common/types supabase/migrations \
>       supabase/tests
>
> Plans 006 and 007 must be DONE.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 006 and 007
- **Category**: security, correctness, architecture, tests
- **Planned at**: commit `b447573`, 2026-08-17

## Why this matters

Current RLS gives a laboratory full batch, collection, species, container, and
prior-test access while it holds one bag. That can expose proprietary collection
locations. Visibility is wrong in the other direction too: owners can inspect
some lab bag/storage internals yet lose retained splits entirely.

The approved contract is deliberately asymmetric. Owners see full data for
their seed plus aggregate external custody; custodians see their own physical
inventory but only batch code, owner, and species from the source. This plan
enforces that boundary in the database and introduces explicit owned-total and
on-site weights.

## Approved visibility contract

For third-party seed Lab B holds, Lab B may see:

- bag/action identifiers needed for its own operations;
- batch code, owner organisation ID/name, and species ID/name;
- current held weight;
- Lab B's own container/location and operational records;
- assignments/transfers involving Lab B;
- only test results performed by Lab B.

Lab B may not see collection ID/code/row, coordinates, collectors, collection
photos, source batch notes/photos, sender storage/container, or tests performed
by Org A/another lab.

For seed Org A owns but another organisation holds, Org A may see:

- immutable transfer events and line weights;
- aggregate remaining weight grouped by parent batch and custodian;
- every test result on seed it owns;
- total owned weight and weight currently on site.

Org A may not see the custodian's internal bags/splits, locations, containers,
or operational notes.

## Current state

- `batches_select` grants holders the complete row
  (`20260804000001_secure_testing_assignments.sql:713-720`), including
  `collection_id` and notes.
- `collection_select` grants the full collection to any holder
  (`20260804000001_secure_testing_assignments.sql:730-746`). Collection rows
  include geographic and field details in
  `20250112075522_remote_schema.sql:93-125`.
- `tests_select` uses bag readability, exposing other organisations' tests
  (`20260804000001_secure_testing_assignments.sql:780-796`).
- `can_read_sub_batch` and storage/container policies expose the originally
  assigned bag's operational details to its owner while lab-created retained
  children remain invisible.
- `batch_current_weight` sums only bags held by the viewer
  (`20260728000001_numeric_weights.sql:43-80`). `active_batches` can therefore
  make an owner's fully-away batch disappear.

Use owner-only base-table RLS plus narrow `SECURITY DEFINER` projections/RPCs;
PostgreSQL RLS cannot hide individual sensitive columns from a broadly readable
row.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Reset schema | `supabase db reset` | exit 0 |
| Generate types | `pnpm gen-types` | exit 0 |
| Database tests | `pnpm test:db` | all pass |
| Web tests | `pnpm --filter=@nasti/web exec vitest run` | all pass |
| Web build | `pnpm --filter=@nasti/web build` | exit 0 |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- RLS and grants for batches, collections, species, sub-batches, storage,
  containers, tests, transfers, assignments, and adjustment history.
- Narrow custodian inventory and owner custody-summary projections.
- Explicit owned/on-site/held weight views and active-inventory semantics.
- Query hooks/types needed to consume the projections without exposing fields.
- Complete pgTAP visibility and aggregate tests.

**Out of scope**:

- Final table layout, filters, modals, and workflow UI (Plan 009).
- Sharing prior tests, collection provenance, or owner transfer.
- Receiver acknowledgement, disposal, mobile, and PowerSync.

## Git workflow

- Branch: `feat/private-custody-read-models`
- Suggested commit: `feat: secure ownership and custody inventory views`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Replace the old visibility matrix with the UAT contract

Build fixtures for owner, current external custodian, former custodian, test
performer, another linked provider, and unrelated organisation. Include an
owner-held sibling, assigned source, lab split, lab merge, return, and tests by
three organisations.

Assert both positive and negative access, including direct base-table queries.
Tests must prove a lab cannot select a collection row or sensitive batch/species
columns through another path, not merely that the UI omits them.

**Verify**: `pnpm test:db` → target assertions fail under current broad RLS.

### Step 2: Restrict direct source-data and operational tables

Make full collection/batch/species access owner-scoped. Remove holder access to
full source rows. Make full sub-batch/storage/container operational data
available only when the caller's organisation is the current holder and the
data belongs to that holder; an owner must not gain lab internals merely through
batch ownership.

Keep mutation through reviewed custody RPCs. Do not solve query breakage by
granting broad base-table SELECT back to custodians.

**Verify**: negative base-table privacy assertions pass while owner/self-owned
inventory tests remain green.

### Step 3: Add the safe custodian inventory projection

Create one stable, security-reviewed view/RPC for all bags currently held by
the caller. It must support both self-owned and foreign-owned rows. For foreign
rows expose only:

- bag and batch identifiers needed by approved RPCs;
- batch code;
- owner ID/name;
- species ID/name;
- current held weight;
- caller-owned container/location fields;
- work-status/transfer identifiers and timestamps needed for labels/actions.

Never include collection identifiers/codes, source notes/photos, foreign
container/location IDs, or other organisations' tests. If a bag still points at
a foreign container, return null for that container until the custodian assigns
one of its own.

**Verify**: projection-shape tests compare the exact column allowlist and prove
self-owned/provider-held and foreign-held rows coexist.

### Step 4: Add owner inventory and external-custody summaries

Provide an owner-authorized batch projection with explicit fields:

- `owned_current_weight`: all positive remaining sub-batch weight under the
  owned parent, regardless of holder;
- `on_site_current_weight`: owned weight whose holder is the owner;
- original weight and existing processing/lineage fields required by owner UI.

Keep an owned batch active while `owned_current_weight > 0`, even if on-site is
zero. Add an external-custody summary grouped only by owner batch and custodian
organisation with current aggregate weight. It must not expose contributing
bag IDs, count, splits, storage, containers, or notes.

Preserve a separate holder-relative weight for physical operations. Remove or
rename ambiguous `current_weight` APIs so callers cannot accidentally choose
custody-relative values for owned totals.

**Verify**: scenarios assert `950 g owned / 850 g on site / 100 g at Lab B`, an
all-away batch remains visible to its owner, and Lab B's held total includes
foreign seed without treating it as lab-owned.

### Step 5: Enforce owner-or-performer test visibility

Tests are readable only when the caller owns the parent batch or
`performed_by_organisation_id` is the caller's organisation. Custody and link
status never share another organisation's result. Owners continue seeing lab
tests on retained descendants via ownership, not exact assignment-bag access.

Ensure inherited/latest-statistics views cannot leak result content to a lab
through the safe inventory projection.

**Verify**: owner sees all owned-seed tests; each lab sees only its own; former
custody changes nothing; unrelated/link-only organisations see none.

### Step 6: Secure transfer, assignment, and adjustment history

Transfer headers/items are readable by sender, recipient, and owner represented
by their items. Assignment work history is readable by requester/owner and
assigned provider. Adjustment detail remains holder-operational or
owner-auditable as appropriate, but owner-facing queries must not reveal lab
storage/bag topology.

Correction and variance reason/actor/time are visible to both parties.

**Verify**: history matrix tests pass before and after custody/work closure.

### Step 7: Adapt query types and run the full gate

Replace cross-organisation PostgREST embeds with the new projections. Remove
collection fields from lab-facing TypeScript types. Regenerate database types
and run every gate.

## Test plan

Expand `supabase/tests/sub_batch_testing_assignments.sql` or create a focused
`supabase/tests/seed_custody_visibility.sql`. Cover:

- full owner access to its own source data;
- exact external allowlist and base-table denial;
- no previous/other-lab tests;
- owner test visibility on retained/merged descendants;
- no owner access to lab bags/storage/containers;
- aggregate away weight without bag topology;
- owned vs on-site vs held totals;
- all-away owner batch visibility;
- former-custodian and unrelated-org denial;
- transfer/correction/discrepancy audit visibility.

Use column-name assertions against the safe projection so future additions do
not silently widen it.

## Done criteria

- [ ] External labs cannot query collection rows or sensitive batch/species data.
- [ ] External labs see only batch code, owner, species, held weight, and their
      own operational/work data.
- [ ] Owners see aggregate external custody, never lab bag/storage internals.
- [ ] Owners see all tests on owned seed; labs see only tests they performed.
- [ ] Owned, on-site, and held weights are explicit and tested.
- [ ] An all-away owned batch remains in owner inventory.
- [ ] Provider organisations see self-owned and foreign-held seed together.
- [ ] Reset, generation, tests, build, and diff check pass; index updated.

## STOP conditions

- A required lab workflow needs collection coordinates or fields beyond the
  approved allowlist.
- PostgREST/view security cannot guarantee column-level privacy; switch to a
  reviewed `SECURITY DEFINER` RPC, do not widen base-table RLS.
- Owner aggregates require exposing contributing lab bag IDs.
- Existing code depends on ambiguous `current_weight` in a way that cannot be
  safely migrated without a caller inventory.

## Maintenance notes

Treat the custodian projection as a public privacy boundary. Any new column
requires product/security review. A future “share prior tests” feature must be
an explicit grant; it must not relax the owner-or-performer base policy.

