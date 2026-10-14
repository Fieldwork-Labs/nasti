# Issue 2: Optional bagging recovery — deferred decisions

## Status

**DEFERRED** on 2026-07-28 pending discussion with the product manager.
Implementation has not started.

## Product constraint

Bagging is optional. Skipping or dismissing the bagging step is a valid user
choice and must not block processing, mark a batch as incomplete, or introduce
a new required workflow stage.

The original audit described this as an "awaiting bagging" state. That framing
is not accepted without further product agreement because it implies an
obligation to complete bagging.

## Decisions to revisit

1. Whether users should have an optional way to reopen bagging after dismissing
   the post-cleaning modal.
2. If recovery is offered, where the action belongs:
   - on every cleaning-output batch;
   - in cleaning history/details; or
   - in a separate optional processing-actions view.
3. Whether the UI should use neutral language such as `Record containers`
   instead of status language such as `Awaiting bagging` or
   `Complete bagging`.
4. Whether bagging completion needs explicit metadata such as
   `bagging_completed_at`, or whether container allocation should be inferred
   only when the optional action is requested.
5. Whether dismissed, unsaved form values should be restored or reopening may
   start with fresh values.
6. How confidently identifiable historical records should be handled, without
   classifying unbagged records as erroneous or incomplete.
7. Whether completed container allocation should remain immutable, with later
   changes handled by split and storage-move workflows, or support direct
   editing.

## Non-restrictive implementation direction

If recovery is approved, the smallest compatible design is an optional
`Record containers` action available from cleaning details or output batches.
It should carry no warning badge, required status, blocking behavior, or
deadline. Storage location remains optional. The existing bagging RPC's atomic
and retry-safe behavior should remain the server-side eligibility boundary.

## Resume condition

Do not implement this issue until the product manager has confirmed:

- whether optional recovery should exist;
- the action location and wording; and
- whether completion metadata or draft persistence is required.
