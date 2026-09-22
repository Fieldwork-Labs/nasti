# Plan 004: Surface, retry, and verify preserved failures

> **Executor instructions**: Complete Plans 002 and 003 first. Run all gates
> and mark Plan 004 DONE in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat d3996c2..HEAD -- apps/mobile/src/lib/powersync apps/mobile/src/components/app apps/mobile/src/hooks apps/mobile/src/contexts/PowerSync.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — exposes retry/dismiss operations on preserved data
- **Depends on**: Plans 002 and 003
- **Category**: correctness / UX / tests
- **Planned at**: commit `d3996c2`, 2026-09-22

## Why this matters

Preserving rejected work is only half the requirement. NASTI already defines a
local-only `sync_failures` table, but no code reads it. Users cannot see that an
item failed, retry it after correcting conditions, or dismiss it. The same
recovery contract must cover terminal media failures while normal transient
work stays quietly queued.

## Current state

- `apps/mobile/src/lib/powersync/schema.ts:229-246` defines `sync_failures`.
- `apps/mobile/src/lib/powersync/connector.ts:119-149` writes row payloads and
  safe error fields before completion.
- No current NASTI module exposes retry/dismiss/list behavior.
- `SettingsMenu.tsx` is the existing app-level surface suitable for a sync
  status/issues entry point.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm --filter nasti-mobile exec vitest run src/lib/powersync/__tests__/syncFailures.test.ts src/components/app/__tests__/SyncIssues.test.tsx` | all pass |
| Auth/sync regression | `pnpm --filter nasti-mobile exec vitest run src/lib/__tests__/offlineAuth.test.ts src/lib/powersync/__tests__/connector.test.ts src/lib/powersync/__tests__/attachments.test.ts` | all pass |
| Typecheck | `pnpm --filter nasti-mobile exec tsc --noEmit --pretty false` | exit 0 |
| Lint | `pnpm --filter nasti-mobile exec eslint src/lib/powersync/syncFailures.ts src/components/app/SyncIssues.tsx src/hooks/useSyncStatus.ts` | exit 0 |

## Scope

**In scope**:

- Create `apps/mobile/src/lib/powersync/syncFailures.ts` and tests.
- Create a sync-status hook and an app-level issues UI reachable from settings.
- Integrate row and media failure retry/dismiss behavior.
- Add safe telemetry and a manual device verification runbook under
  `apps/mobile/docs/`.

**Out of scope**:

- Editing server RLS rules from the client.
- Automatically modifying rejected user data.
- Deleting preserved bytes merely because a failure is dismissed from the UI.
- Repairing the unrelated baseline test/lint failures listed in
  `plans/README.md`.

## Git workflow

- Branch: `feat/004-sync-failure-recovery`
- Conventional commits, e.g. `feat(mobile): add sync issue recovery`

## Steps

### 1. Implement typed, allowlisted failure operations

Create list, retry, and dismiss APIs. Never interpolate arbitrary persisted
table/column names into SQL. Validate `target_table` against an explicit NASTI
table allowlist and validate operation payload keys against the table's known
columns before constructing a local write.

Row retry must reconstruct the original PUT/PATCH/DELETE as a new PowerSync
local write and remove the failure record only after that write succeeds.
DELETE retry is meaningful and should be idempotent. Dismiss removes only the
failure notice, not unrelated local data.

Media retry reads the preserved canonical bytes and creates a fresh durable
queue job; it removes the failure record only after queue registration succeeds.

**Verify**: tests cover each operation, malformed JSON, unknown table/column,
missing bytes, transaction rollback, and duplicate retry clicks.

### 2. Expose actionable sync state

Create `useSyncStatus` returning counts for:

- queued rows/media;
- waiting for live authentication;
- actively uploading;
- permanent row/media failures;
- last safe error/disposition.

Do not infer “logged out” from unavailable upload credentials. Present it as
“sync paused; local work is safe” with an optional re-auth action that does not
lock the user out of local data.

**Verify**: hook tests drive queue/auth states and assert stable user-facing
categories.

### 3. Add a recovery UI reachable from Settings

Add a “Sync issues” entry with a badge when permanent failures exist. Each
failure shows entity/type, safe message, time, Retry, and Dismiss. Do not show
raw payloads by default and never show headers/tokens.

Retry errors keep the record and display a non-destructive message. Dismiss
must require confirmation that it hides the issue but does not delete the
captured record/media from normal local views.

Queued transient work should not create noisy errors; show only aggregate
pending/paused status.

**Verify**: component tests cover empty, pending-only, row failure, media
failure, retry failure, retry success, and dismissal confirmation.

### 4. Add safe telemetry and diagnostics

Emit disposition events with operation/media ID, table/kind, safe server code,
retry count, queue age, and app version. Hash or omit identifiers if the
existing telemetry policy requires it. Never include operation payloads,
captions, filenames, coordinates, bearer tokens, or raw request objects.

**Verify**: serialize every captured telemetry argument in tests and assert
known token/payload fixtures are absent.

### 5. Add installed-device verification

Create `apps/mobile/docs/offline-auth-upload-verification.md` with a repeatable
Capacitor/PWA matrix:

1. login, sync, force token expiry, block DNS/HTTP, cold start;
2. confirm UI opens from local identity in under the five-second bound;
3. create rows, photos, and audio offline; force-close and reopen;
4. restore network and verify each uploads once;
5. simulate stalled auth while `navigator.onLine === true`;
6. inject an anonymous/expired-token `42501` and confirm retention;
7. inject a confirmed RLS denial and confirm local failure + later queue progress;
8. inject one terminal media error and confirm later media progresses;
9. retry from Sync issues;
10. logout offline, cold start, and confirm the app stays logged out.

Record expected database rows, Storage objects, queue counts, and safe log
messages for each step. Do not call the feature production-verified until this
matrix has run on at least one Android device and one PWA/browser profile.

## Test plan

In addition to unit/component tests, add an integration test at each HTTP
adapter seam. Independently mocking a request failure and a later session check
cannot reproduce the auth race; the test must inspect the actual Authorization
header used by the failing row/TUS request.

Required end-to-end invariants:

- no credentials: no request, no completion;
- exact token is bound to request;
- ambiguous authorization failure remains queued;
- permanent row/media failure is saved before advancement;
- later queue item proceeds;
- retry reconstructs work without duplicates;
- logout removes offline access locally even without network.

## Done criteria

- [ ] Users can see, retry, and dismiss preserved row/media failures.
- [ ] Retry APIs validate table and column identifiers against allowlists.
- [ ] Missing auth is shown as paused sync, not forced logout.
- [ ] Permanent failures never silently delete bytes/payloads.
- [ ] Later queue items progress after one terminal item.
- [ ] Telemetry contains no sensitive payloads or credentials.
- [ ] Focused/regression tests, scoped lint, and typecheck pass.
- [ ] Device/PWA runbook exists and records results when executed.

## STOP conditions

- Retrying a stored operation requires guessing a schema mapping not encoded in
  the failure record; report and add an explicit versioned mapping.
- The queue API cannot expose reliable status counts; do not infer them from
  console output.
- Dismissing a failure would necessarily delete the only local copy of data.
- Integration tests cannot observe the actual outgoing Authorization header;
  add a controllable HTTP adapter seam before claiming coverage.

## Maintenance notes

Version stored failure payloads if table schemas evolve. Review migrations for
whether old failure records remain retryable; when they do not, keep export or
manual-recovery visibility rather than silently discarding them.

