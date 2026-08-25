# Plan 006: Establish testing-provider, seed-transfer, and bag-lineage foundations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If any STOP condition occurs, stop and report — do not improvise.
> When complete, update this plan's status in `plans/README.md` unless a
> reviewer told you they maintain the index.
>
> **Drift check (run first)**:
>
>     git diff --stat b447573..HEAD -- \
>       apps/web/src apps/web/package.json packages/common/types \
>       supabase/functions supabase/migrations supabase/seed.sql supabase/tests
>
> Compare any changed in-scope file with the current-state evidence below. Stop
> if assignment, split, merge, cleaning, organisation-type, or link semantics
> changed materially.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: architecture, migration, tests
- **Planned at**: commit `b447573`, 2026-08-17

## Why this matters

UAT replaced two load-bearing assumptions. A Testing organisation is a normal
seed-owning organisation with an additional provider capability, not an
exclusive mode. Also, temporary custody never transfers ownership: parent
`batches.organisation_id` remains the owner while `sub_batches.held_by_org_id`
is only the current custodian.

The current schema has no grouped transfer record and no structured bag
lineage. Before partial returns, merged returns, late tests, privacy-safe owner
summaries, or corrections can work, the database must be able to answer what
moved and which source assignments contributed to any derived bag.

## Settled domain contract

- `batches.organisation_id` is ownership for this phase. Every sub-batch under
  one parent batch has the same owner.
- `sub_batches.held_by_org_id` is custody only. Split, merge, testing, and
  returns never change ownership.
- A seed-transfer event is one dispatch from one sender to one recipient and
  contains one or more physical bag/portion line items.
- Each bag sent for testing has its own testing assignment linked to the
  outbound transfer line.
- Split, merge, and cleaning preserve structured ancestry. Testing and transfer
  history do not make sibling bags from the same parent batch incompatible for
  merge.
- A sender may assign only seed it both owns and holds. Custody alone never
  permits forwarding somebody else's seed to a third party.
- Ownership transfer/sale, intentional disposal, and sharing previous test
  results with another lab are explicitly out of scope.

## Current state

- `supabase/migrations/20251114000001_add_organisation_type.sql:5-15` defines
  exclusive `General | Testing` values.
- `supabase/migrations/20260805000001_testing_org_member_permissions.sql:1-18`
  assumes Testing organisations never collect and forces their Members to
  inventory-only access.
- `supabase/functions/create_link_request/index.ts:101-141` prohibits a Testing
  organisation from requesting another provider's services.
- `supabase/migrations/20260804000001_secure_testing_assignments.sql:406-485`
  loops over a multi-bag send and creates unrelated assignment rows; there is
  no event representing “what went out.”
- `supabase/migrations/20260728000004_split_sub_batch_containers.sql:110-147`
  creates split children without a source-child relationship.
- `supabase/migrations/20260728000007_optional_sub_batch_merge_location.sql:137-165`
  creates a merge destination without structured source relationships; source
  UUIDs exist only inside free-text adjustment reasons.
- `supabase/migrations/20260728000007_optional_sub_batch_merge_location.sql:83-94`
  blocks merges involving an active assignment because lineage cannot yet
  carry the assignment forward.

Repository conventions to preserve:

- Complex mutations are locked, atomic `SECURITY DEFINER` RPCs with explicit
  `search_path`, grants, comments, and mapped SQLSTATEs. Follow
  `fn_assign_bags_for_testing` in
  `supabase/migrations/20260804000001_secure_testing_assignments.sql`.
- Preserve source rows and history by zeroing through weight adjustments, as in
  `fn_merge_sub_batches`.
- Nothing is deployed and there is no production data. Keep the migration set
  correct from a fresh reset; edit the existing feature migrations in place
  rather than adding compatibility/backfill machinery for nonexistent data.
- Generated database types come from `pnpm gen-types`; never hand-edit them.

## Target schema

Use these names unless the live schema makes one impossible; do not substitute
a materially different model without stopping:

1. Replace `organisation.type` with
   `organisation.is_testing_provider boolean NOT NULL DEFAULT false`.
2. Rename link roles from `general_org_id` / `testing_org_id` to neutral
   `requesting_org_id` / `provider_org_id` in both accepted links and requests.
   The provider side must have `is_testing_provider = true`; either side may
   otherwise be a provider.
3. Add an append-only `seed_transfer_event` header with sender, recipient,
   event kind, effective timestamp, recorded timestamp/user, and nullable
   correction/reversal reference and reason.
4. Add `seed_transfer_item` lines with transfer ID, moved sub-batch ID, parent
   batch ID, owner organisation snapshot, and transferred weight snapshot.
   Header plus lines are the immutable record of what went out.
5. Link every testing assignment to exactly one outbound transfer item. Keep
   one assignment per originally dispatched bag.
6. Add immutable `sub_batch_lineage` edges from every source bag to every
   derived bag, with operation kind and operation identifier. It must support
   one-to-many split/cleaning and many-to-one merge without cycles.
7. Add a recursive, security-invoker lineage helper that resolves all testing
   assignments represented by a bag. The original outbound bag must resolve to
   itself; descendants resolve through all ancestors; duplicates collapse.
8. Add a constrained kind and structured nullable references to
   `batch_weight_adjustments` so later plans can distinguish test consumption,
   variance, split, merge, cleaning, and correction without parsing `reason`.
   Preserve `reason` for human-readable audit text.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Reset schema | `supabase db reset` | exit 0; all migrations and seed apply |
| Generate types | `pnpm gen-types` | exit 0; generated schema has new tables/columns |
| Database tests | `pnpm test:db` | all pgTAP files pass |
| Web tests | `pnpm --filter=@nasti/web exec vitest run` | all tests pass |
| Web build | `pnpm --filter=@nasti/web build` | exit 0 |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Organisation type/capability migrations and every mechanical reference
  required to keep the repo compiling.
- Organisation-link/request schema, policies, edge functions, hooks, seed data,
  and tests.
- Transfer header/item schema and assignment link.
- Bag-lineage schema/helper and atomic writes from split, merge, and cleaning
  paths.
- Structured weight-adjustment classification.
- Generated Supabase types and pgTAP coverage.

**Out of scope**:

- Partial-return, assignment-closure, late-test, discrepancy, and correction
  user operations; Plan 007 implements them.
- Cross-organisation privacy projections and new weight semantics; Plan 008.
- Unified inventory and workflow UI; Plan 009. Mechanical flag/column renames
  needed for compilation are allowed, but do not redesign screens here.
- Ownership sale/transfer, disposal, prior-test sharing, and mobile/PowerSync.

## Git workflow

- Branch: `feat/seed-transfer-lineage-foundation`
- Conventional commits; suggested commit:
  `refactor: add seed transfer and bag lineage foundations`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Replace stale tests with foundation characterisation tests

Update/add pgTAP fixtures before implementation. Assert:

- a provider can still collect/own seed and can request another provider;
- a non-provider cannot be the provider side of a link or receive assignments;
- accepted links remain mandatory;
- a multi-bag send can be represented by one transfer header and distinct
  items/assignments;
- split children resolve the source assignment;
- merge destinations resolve the union of source assignments;
- cleaning output bags preserve source ancestry across parent-batch boundaries;
- lineage rejects cycles and cross-owner ancestry;
- adjustment kinds and structured references satisfy their constraints.

Model fixtures on `supabase/tests/sub_batch_testing_assignments.sql` and
`supabase/tests/sub_batch_merge.sql`.

**Verify**: `pnpm test:db` → new assertions fail only because the target schema
does not exist; unrelated tests pass.

### Step 2: Convert organisation type into an additive capability

Edit the existing migrations from scratch. Remove the exclusive enum, add the
boolean flag, remove Testing-only permission normalisation, and update link
creation/acceptance, provider discovery, assignment validation, seed data, and
tests. Preserve ordinary per-member `collections` and `inventory` permissions
for provider organisations.

Update all TypeScript references so the intermediate branch compiles. A
temporary screen branch on `is_testing_provider` may remain until Plan 009, but
no backend rule may treat providers as unable to own, collect, or send seed.

**Verify**: reset, generate types, database tests, and web build all succeed.

### Step 3: Add immutable transfer headers and line items

Create the transfer tables, constraints, indexes, RLS skeleton, and comments.
Only reviewed RPCs may insert; clients must not update or delete events/items.
Validate sender and recipient differ, weights are positive numeric values, the
owner snapshot matches the parent batch, and every item belongs to its header's
single sender/recipient movement.

Add the assignment foreign key to its outbound transfer item and enforce that
the line's moved bag/batch and the assignment bag/batch agree.

Do not yet replace return behavior; Plan 007 switches operations onto the
ledger.

**Verify**: `pnpm test:db` → transfer structural and immutability assertions pass.

### Step 4: Add structured sub-batch lineage

Create lineage rows and a recursive assignment-resolution helper. Guard
against self-links, cycles, cross-owner links, and relationships unsupported by
the named operation. Add indexes for ancestor and descendant traversal.

Update the latest definitions of split, merge, cleaning, and cleaning-output
bagging RPCs to write lineage in the same transaction as the derived bag.
Replace the active-assignment merge prohibition with lineage propagation while
preserving same-parent-batch and same-current-custodian merge checks.

**Verify**: `pnpm test:db` → split, merge, cleaning, and multi-source assignment
lineage assertions pass; existing weight-conservation tests still pass.

### Step 5: Classify weight adjustments

Add the constrained adjustment kind and structured references, then update all
existing adjustment-producing RPCs. Exactly one appropriate reference should
be present where applicable. Human reasons remain populated, but no test or
query may determine semantics by matching reason text.

**Verify**: `rg -n "reason.*(LIKE|~)|reason\)" supabase/tests supabase/migrations`
shows no semantic parsing of adjustment reasons; `pnpm test:db` passes.

### Step 6: Regenerate types and run the full gate

Regenerate types, repair only mechanical compile fallout, and run every command
in the table. Update the plan index.

## Test plan

- Extend `supabase/tests/sub_batch_testing_assignments.sql` for provider/link,
  transfer grouping, assignment link, and lineage resolution.
- Extend `supabase/tests/sub_batch_merge.sql` for multi-assignment lineage and
  removal of the old active-assignment prohibition.
- Extend `supabase/tests/cleaning_bagging.sql` for cross-batch lineage.
- Rewrite `supabase/tests/testing_org_member_permissions.sql` around ordinary
  permissions plus provider capability; remove assertions that providers are
  inventory-only.
- Keep all pre-existing storage, numeric-weight, and concurrency assertions.

## Done criteria

- [ ] `organisation.type` and `organisation_type` have no live references.
- [ ] Provider organisations retain normal collection/inventory capabilities.
- [ ] One multi-bag dispatch has one header, multiple items, and one assignment
      per outbound item.
- [ ] Split, merge, and cleaning descendants resolve all source assignments.
- [ ] Transfer and lineage tables are append-only to authenticated clients.
- [ ] Weight-adjustment semantics no longer rely on free-text parsing.
- [ ] Reset, type generation, DB tests, web tests, build, and diff check pass.
- [ ] No source files outside the declared scope changed.
- [ ] `plans/README.md` is updated.

## STOP conditions

- Production data or a deployed migration path exists; in-place migration edits
  would then be unsafe.
- A sub-batch under one parent batch can currently have a different owner.
- Cleaning output bags cannot be linked to their input without inventing
  ownership or duplicating weight.
- Recursive lineage can cycle or disagree with transfer/assignment foreign keys.
- A verification failure would require implementing Plan 007–009 behavior here.

## Maintenance notes

Future ownership transfer must not overload custody or mutate historical owner
snapshots. Reviewers should scrutinize all derived-bag creation paths: a single
path that omits lineage will break later return and assignment closure logic.

