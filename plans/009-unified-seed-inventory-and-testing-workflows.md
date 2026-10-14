# Plan 009: Unify seed inventory and expose the new testing workflows

> **Executor instructions**: Follow this plan in order and verify each step.
> Stop rather than changing backend/privacy contracts established by Plans
> 006–008. Update the status row in `plans/README.md` when complete unless a
> reviewer owns the index.
>
> **Drift check (run first)**:
>
>     git diff --stat b447573..HEAD -- \
>       apps/web/src packages/common/types supabase/functions supabase/tests
>
> Plans 006, 007, and 008 must be DONE.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 006, 007, and 008
- **Category**: direction, correctness, frontend, tests
- **Planned at**: commit `b447573`, 2026-08-17

## Why this matters

The web app currently chooses either an owner inventory or an open-assignment
list from an exclusive organisation type. A testing provider that also collects
its own seed therefore cannot see a unified physical inventory, and retained
seed disappears as soon as work closes.

This plan builds one custody-aware inventory for every organisation, overlays
ownership and work labels, and exposes grouped dispatch, explicit work closure,
partial/repeated returns, late tests, discrepancies, and corrections without
violating the privacy projections from Plan 008.

## Product contract

- One inventory contains everything the organisation physically holds: its own
  seed and seed held for others.
- Owned seed away at labs remains visible to the owner through batch totals and
  custody summaries, not as the labs' internal bags.
- A provider designation adds discovery/incoming-link/work capability; it does
  not remove Trips, Collections, inventory, permissions, or the ability to send
  owned seed to another linked provider.
- Main external-custody rows show batch code, explicit `Owner: …`, species,
  held weight, local storage, and work/custody tags. They never show collection
  data.
- Default direction is one unified view with filters. Do not create a separate
  lab-only inventory. A compact assignment-history panel/tab may exist if it
  does not become the source of inventory membership.

## Current state to replace

- `apps/web/src/routes/_private/inventory/index.tsx:17-23` chooses mutually
  exclusive General and Testing pages.
- `BatchFiltersContext.tsx:109-143` enables exactly one of owned batches or open
  assignments.
- `useTestingOrgAssignments.ts:96-107` excludes closed assignments, so retained
  seed disappears.
- `useTestingOrgAssignments.ts:146-177` fetches prohibited collection data.
- `ReturnBatchModal.tsx:36-79` returns only a whole assignment bag and says a
  retained split belongs to the lab.
- `testingAssignments.ts:88-94` removes both test and return actions when work
  closes.
- `useAssignBagsForTesting.ts` invalidates `['sub-batches']`, while the actual
  query key in `useSubBatches.ts` is `['subBatches', batchId]`.

Follow existing React/TanStack Query, TanStack Router, Tailwind, Zod, toast, and
pure-rule-test conventions. Avoid new `useEffect` state synchronisation where
derived state or event handlers suffice.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web tests | `pnpm --filter=@nasti/web exec vitest run` | all pass |
| Typecheck | `pnpm --filter=@nasti/web exec tsc -b` | exit 0 |
| Targeted lint | `pnpm --filter=@nasti/web exec eslint src/routes/_private/inventory src/components/inventory src/components/tests src/hooks src/lib` | exit 0, no warnings |
| Production build | `pnpm --filter=@nasti/web build` | exit 0 |
| Database regression | `pnpm test:db` | all pass |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- Unified inventory route, query/view models, rows, labels, filters, and actions.
- Owned/on-site/custodian weight presentation.
- Testing-provider navigation/settings/link management.
- Grouped send, assignment closure, partial/repeated return, testing timestamps,
  variance, and correction UI/hooks.
- Central query keys/invalidation and focused pure/component tests supported by
  current dependencies.
- Deletion of obsolete exclusive Testing inventory code after migration.

**Out of scope**:

- Backend/RLS contract changes except a demonstrated defect that blocks the
  plan; stop and report instead of widening it.
- Prior-test sharing, collection disclosure, disposal, ownership sale,
  receiver acknowledgement, mobile, or PowerSync.
- A separate UI for foreign-seed cleaning; it remains intentionally unexposed.

## Git workflow

- Branch: `feat/unified-seed-inventory`
- Suggested commit: `feat: unify custody inventory and testing workflows`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define pure inventory/work view models and tests

Before components, define discriminated view models for:

- self-owned/on-site batch;
- self-owned batch partly/fully away with custodian summaries;
- foreign-owned bag currently held;
- open/closed work overlays and permitted actions.

Add pure tests for labels, filters, weights, and actions. Closed work must not
remove test/return actions while seed is still held. Collection fields must be
absent from the foreign-held type.

**Verify**: targeted Vitest file passes.

### Step 2: Replace organisation-mode routing with one inventory shell

Remove `RouteDecider`, the union of incompatible search schemas, and mutually
exclusive query enablement. Query Plan 008's owner and current-custody
projections together and assemble one list without per-row queries.

Keep owned batch grouping/expansion where useful. Render foreign-held physical
bags as actionable custody rows. An organisation that is a provider and owns
seed must see both in one request cycle.

Add filters/tags for at least:

- owned by us;
- held for others;
- away at a provider;
- testing pending/completed/partially/not completed;
- owner/custodian/provider;
- species, local location, and search.

**Verify**: tests cover mixed self-owned/foreign-held and all-away owned batches;
typecheck passes.

### Step 3: Render ownership, custody, and weights explicitly

Owner batch rows show `owned_current_weight`; when different, append
`(on_site_current_weight on site)`. Expanded custody summaries show aggregate
weight per external organisation and replace location with `At <provider>`.
Never render lab bag counts, IDs, containers, locations, or split details to
the owner.

Foreign-held rows show batch code, species, `Owner: Org A`, held weight, and the
current organisation's own storage/container. Do not fetch or render collection
code/ID/details. Self-owned rows retain normal collection detail.

**Verify**: view-model/component tests cover `950 g total (850 g on site)`,
zero-on-site, external privacy, and provider-held totals.

### Step 4: Make provider capability additive throughout navigation/settings

Remove provider-based hiding of Trips, Collections, member permissions, people,
and ordinary inventory settings. Provider-capable organisations also receive
incoming link management and may manage outgoing links to other providers.

Use neutral requester/provider language. Provider discovery filters on the new
capability flag. Preserve accepted-link requirement before sending.

**Verify**: provider and non-provider navigation/settings tests or pure route
configuration tests pass; build has no old organisation-type branches.

### Step 5: Show grouped dispatch and transfer history

Keep the bag basket, but submit one transfer event containing all selected bag
lines. The confirmation and success state show one dispatch with recipient,
timestamp, total, and line items. Owner history shows immutable “what went out”
records and any correction/reversal events.

Ensure callers can select only bags they both own and hold. A provider's own
seed is eligible; foreign seed held for testing is not forwardable.

**Verify**: send-view tests cover multiple bags, partial sample split, provider
sending owned seed, foreign-held rejection, and grouped response rendering.

### Step 6: Add explicit work closure and retained-seed testing

Replace “first test means Tested” with work-status labels and an explicit
`Mark testing complete` action. The modal offers Completed, Partially completed,
and Not completed; partial/not completed require a note. Display audited later
status corrections.

Offer `Record quality test` whenever the organisation currently holds eligible
seed, even if work is closed. Add performed date/time to the form, defaulting to
now. Display performed and recorded timestamps and mark late-entered results.
Do not show other organisations' results.

**Verify**: rule/form tests cover open/closed work, note validation, retained
tests, and performed/recorded display.

### Step 7: Replace whole-assignment return with repeatable return portions

Return acts on held bags/weights, not assignment status. Allow whole or partial
weight and multiple items in one return event. Explain that each return creates
a new unstored bag for the owner and retained weight remains owned by that owner.

On the first return tied to open work, collect a work status for every open
assignment in lineage; for a merged bag, close all represented open assignments.
Later returns remain available without work prompts.

Add `final return` confirmation. Show calculated discrepancy, require a reason
when nonzero, warn prominently but do not block by size. After success, custody
must show zero rather than phantom lab seed.

**Verify**: tests cover first/second return, partial retained balance, merged
lineage outcomes, returned-untested, and final variance.

### Step 8: Add transfer correction and variance reclassification UI

Expose `Correct transfer` to authorised sender Admins. Before downstream use,
show reversal-and-replacement; afterward, explain the compensating correction.
Always require a reason and render both original and correction in history.

When entering a forgotten consuming test after a variance, allow selecting the
matching variance for reclassification. Explain that total weight will not be
deducted again.

**Verify**: pure mutation/view-model tests cover both correction modes and
no-double-deduction presentation.

### Step 9: Centralise query keys and remove obsolete code

Create a small query-key factory/invalidation helper used by send, return,
split, merge, test, close, correction, variance, and storage mutations. Remove
the `sub-batches`/`subBatches` mismatch. Delete old assignment-driven Testing
inventory components/hooks only after no imports remain.

**Verify**: `rg -n 'organisation.*type|InventoryPageTesting|sub-batches' apps/web/src`
returns no stale mode branch or incorrect cache key; tests/typecheck pass.

### Step 10: Run full verification

Run every command in the table and update the plan index.

## Test plan

Extend the existing pure Vitest suite; introduce component tests only if the
repo already has the needed runtime after Plan 006–008. Do not add a test stack
solely for snapshots. Cover:

- unified mixed inventory and filters;
- owned/on-site/held totals;
- external metadata allowlist;
- provider normal navigation and bidirectional link roles;
- grouped dispatch;
- explicit three-status closure;
- tests after closure and late timestamps;
- repeated/merged returns and final discrepancy;
- correction history and cache invalidation.

Keep `pnpm test:db` as the integration/security authority.

## Done criteria

- [ ] No exclusive General/Testing inventory or navigation branch remains.
- [ ] Every organisation sees one inventory containing all seed it holds.
- [ ] Owners retain all-away batches and see owned/on-site plus custodian totals.
- [ ] External rows show batch code, owner, species, and permitted operational
      data only; no collection data is requested.
- [ ] Work closure and custody actions are independent in the UI.
- [ ] Partial and later returns remain available after work closure.
- [ ] Late tests show performed vs recorded time.
- [ ] Grouped transfer, correction, and discrepancy history is understandable.
- [ ] All mutations invalidate one canonical set of query keys.
- [ ] Tests, typecheck, lint, build, DB regression, and diff check pass.
- [ ] `plans/README.md` is updated.

## STOP conditions

- A required field is absent from Plan 008's projections; do not query a
  sensitive base table as a workaround.
- The UI needs to decide ownership, custody, work closure, or reconciliation
  rules that belong in the database.
- A foreign-held row requires collection provenance beyond batch code/species.
- A separate Testing-only inventory becomes necessary for correctness rather
  than optional presentation; report the evidence before adding it.

## Maintenance notes

Inventory membership follows ownership and custody, never organisation
designation or open work. Future tabs may present different slices, but they
must share this same underlying inventory contract.

