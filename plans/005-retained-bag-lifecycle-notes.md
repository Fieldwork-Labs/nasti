# Note 005: What a Testing organisation may do with seed it holds

> **SUPERSEDED 2026-08-17:** UAT reversed this note's ownership premise.
> Retained seed remains owned by the originating organisation, remains visible
> there as aggregate external custody, and may be returned in later movements
> after testing work closes. Plans 006–009 contain the replacement contract.

> This is a decision note, not an executable plan. It records findings from a
> 2026-08-06 discussion so they can be planned later without re-deriving them.
> Nothing here has been implemented. Written against commit `2d5b00f`, after
> Plan 004's database work landed and `pnpm test:db` passed.

## The situation

A Testing organisation is sent a bag. It runs a quality test, which consumes
some of the seed through `fn_create_quality_test`. Seed remains in the bag. What
may the laboratory do with it?

Plan 004 decided that a bag a Testing organisation splits off and keeps — a
retained QA subsample, insurance against a disputed result — belongs to them and
is invisible to the General organisation that sent the seed. That decision
holds. These notes are about what happens next, which Plan 004 did not address.

## What is possible today

Verified against the migrations at `2d5b00f`.

| Action | Works | Route |
|---|---|---|
| Return the whole remaining bag | yes | `fn_return_bag_from_testing` |
| Split off a portion, return the rest | yes | `fn_split_sub_batch`, then return |
| Keep testing until the bag reaches zero | yes | assignment auto-closes as `consumed` |
| Shelve it in their own container and location | yes | `fn_set_sub_batch_storage` |
| Merge two retained bags | only within one parent batch | `fn_merge_sub_batches` |
| Clean a retained bag | yes, but wrongly — see finding 2 | `fn_clean_sub_batch` |

Not possible:

- **Returning a retained bag later.** `fn_return_bag_from_testing` is addressed
  by assignment id, and a retained bag has no assignment. Once split off it is
  the laboratory's permanently, with no route back.
- **Discarding seed.** There is no disposal operation anywhere in the schema.
  The only path to zero is consumption by a quality test. A laboratory that
  finishes with 80g and bins it cannot record that — and neither can a General
  organisation with spoiled or contaminated seed.

## Findings

### 1. A retained bag locks the parent batch from deletion, permanently and invisibly

`batches_delete` (`20260723000005_rls_perf_rewrite.sql`) requires
`NOT public.batch_has_externally_held_bags(id)`, and that predicate compares
`sub_batches.held_by_org_id` against `batches.organisation_id` with **no weight
filter**. So any retained bag — including one the laboratory has since consumed
to zero — blocks the owner from ever deleting that batch. The bag causing the
refusal is invisible to them, so the error is undiagnosable from the General
side.

The rejection itself is right: seed that physically exists elsewhere should stop
a record being destroyed. What is wrong is that the lock never lifts.

### 2. Cleaning a retained bag silently transfers it to the General organisation

`fn_clean_sub_batch` (`20260728000002_batch_cleaning_workers_duration.sql:346`)
builds its output batch from `v_organisation_id`, which it reads from the
**parent batch's** `organisation_id`. A Testing organisation cleaning its own
retained bag therefore produces a General-owned batch, whose new bags default —
via the `held_by_org_id` trigger — to General's custody. The laboratory consumes
its own material and the result appears in someone else's inventory.

This is not a designed behaviour. It fell out of gating cleaning on bag custody
in Plan 004 Step 3: the guard correctly stops General cleaning a bag that is out
at a laboratory, and incidentally permits the reverse, which nobody specified.

### 3. Retained bags have no lifecycle

They accumulate in a laboratory's inventory indefinitely: no state, no expiry,
no disposal, no audit trail back to the owner. Nothing distinguishes a subsample
retained last week from one retained three years ago.

## Suggested direction

Not yet agreed; recorded as the recommendation made at the time.

1. **Add a disposal operation.** Something of the shape
   `fn_discard_sub_batch(p_sub_batch_id uuid, p_reason text)`, gated on
   `is_current_bag_custodian`, writing a negative `batch_weight_adjustments` row
   to bring the bag to zero and recording why. This is the substantive gap: the
   model has no verb for seed being used up or thrown away, and it is missing
   for General as much as for Testing.
2. **Make the delete lock weight-aware.** Change
   `batch_has_externally_held_bags` to ignore zero-weight bags. Disposal then
   releases the lock naturally — a laboratory that finishes with the seed
   unblocks the owner's batch without any cross-organisation coordination. This
   is a one-line predicate change that turns finding 1 from permanent into
   self-resolving, and it only becomes useful once disposal exists.
3. **Block Testing-side cleaning** rather than inventing ownership rules for it.
   Cleaning is a General production workflow; a laboratory has no reason to run
   it. Same guard shape as the active-assignment rejection already in that
   function.

## Open question

**Should a retained bag ever be returnable?**

Two coherent readings:

- Under strict ownership it is the laboratory's, and disposal is the only exit.
  Simple, and consistent with the Plan 004 decision.
- Laboratories do sometimes send material back. Supporting that needs either a
  fresh assignment in the reverse direction — which the current schema cannot
  express, since `assigned_by_org_id` is assumed to be the General side — or a
  distinct hand-back operation that does not need an assignment at all.

Deferred until someone asks for it. Worth raising with the stakeholder alongside
the treatments question already recorded in Plan 004.
