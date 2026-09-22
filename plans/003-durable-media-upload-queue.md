# Plan 003: Queue photo and audio uploads durably

> **Executor instructions**: Complete Plans 001 and 002 first. Follow all
> verification gates and mark Plan 003 DONE in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat d3996c2..HEAD -- apps/mobile/src/hooks/usePhotosMutate.ts apps/mobile/src/hooks/useAudiosMutate.ts apps/mobile/src/lib/persistFiles.ts apps/mobile/src/lib/persistAudio.ts apps/mobile/src/lib/powersync apps/mobile/src/contexts/PowerSync.tsx apps/mobile/src/routes/_private/trips`

## Status

- **Priority**: P1
- **Effort**: L (multi-day)
- **Risk**: HIGH — changes byte persistence, upload, retry, and deletion
- **Depends on**: Plans 001 and 002
- **Category**: correctness / architecture
- **Planned at**: commit `d3996c2`, 2026-09-22

## Why this matters

Photo and audio metadata is written to PowerSync, and the bytes are cached
locally, but the actual Storage upload lives inside a foreground React Query
mutation. Missing credentials or TUS failure is logged and then returned as
success. After navigation or restart there is no durable job that retries the
bytes, so metadata can sync while its object never reaches Storage.

After this plan, form submission succeeds once bytes and metadata are durable
locally. A background attachment queue owns network transfer. Auth/network
failures remain queued, permanent failures preserve both bytes and a recovery
record, and one bad attachment cannot stop later attachments.

## Current state

- `usePhotosMutate.ts:160-209` inserts metadata, calls unbounded
  `getSession()`, attempts TUS once, catches failure, and returns the photo.
- `useAudiosMutate.ts:153-201` does the same for audio.
- New-photo routes manually write base64 bytes before invoking the mutation
  (`collections/new.tsx:201-215` and equivalent routes), while audio persistence
  is inside its hook. This inconsistent ownership creates partial-write edges.
- `persistFiles.ts` stores photo bytes in IndexedDB as data URLs;
  `persistAudio.ts` stores audio blobs. These stores are valuable recovery
  sources and must not be deleted during the migration.
- `@powersync/web` is already a dependency and provides `AttachmentQueue` and
  IndexedDB file storage, the pattern already proven in Fieldbook.

## Required state machine

```text
Captured -> Persisting locally -> Queued -> WaitingForAuth -> Sending
                                  |                         | success
                                  |                         v
                                  +----------------------> Complete
                                                            
Sending -- auth/network/401/403 --> Queued
Sending -- confirmed terminal --> FailedLocally -> queue advances
FailedLocally -- user retry -----> Queued
```

Local metadata must distinguish `pending`, `uploading`, `uploaded`, and
`failed`; the current `uploaded_at` must be null until Storage confirms success.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm --filter nasti-mobile exec vitest run src/lib/powersync/__tests__/attachments.test.ts src/hooks/__tests__/usePhotosMutate.test.tsx src/hooks/__tests__/useAudiosMutate.test.tsx` | all pass |
| Typecheck | `pnpm --filter nasti-mobile exec tsc --noEmit --pretty false` | exit 0 |
| Lint | `pnpm --filter nasti-mobile exec eslint src/lib/powersync/attachments.ts src/lib/powersync/attachmentErrors.ts src/lib/storageUpload.ts src/hooks/usePhotosMutate.ts src/hooks/useAudiosMutate.ts src/contexts/PowerSync.tsx` | exit 0 |

## Scope

**In scope**:

- Create `apps/mobile/src/lib/storageUpload.ts`.
- Create `apps/mobile/src/lib/powersync/attachments.ts` and
  `attachmentErrors.ts`, plus tests.
- Extend `apps/mobile/src/lib/powersync/schema.ts` with local-only media failure
  metadata if AttachmentQueue's built-in state is insufficient.
- Update `PowerSync.tsx` to start/stop the attachment runtime.
- Refactor photo/audio mutation hooks and their four create/edit route callers.
- Preserve and migrate existing `image-store` and `audio-store` content.

**Out of scope**:

- Removing the existing local photo/audio stores before migration has shipped
  and been observed.
- Download-cache optimisation.
- Changing Storage bucket layout or RLS policies.
- Failure-list UI (Plan 004).

## Git workflow

- Branch: `feat/003-durable-media-upload-queue`
- Conventional commits, e.g. `feat(sync): queue media uploads durably`

## Steps

### 1. Prove AttachmentQueue fairness and retention first

Write a characterization test against the installed `@powersync/web` version:

- a retryable failure leaves item A queued;
- item B is still attempted rather than starved forever;
- a permanent disposition removes A from active retries and advances;
- local bytes remain readable until NASTI explicitly deletes or archives them.

If fairness or byte retention is not available, do not paper over it. Implement
a small local-only media job dispatcher with `status`, `attempt_count`, and
`next_attempt_at`, selecting eligible jobs independently, while retaining the
same interfaces below.

**Verify**: the characterization test passes before integrating hooks.

### 2. Centralize TUS upload and error sanitization

Move duplicated photo/audio TUS code to `storageUpload.ts`. Accept the exact
Plan 002 `RequestCredentials` (or a live `Session` returned from the same seam)
and set that token on the actual TUS request. Keep resumability, upsert, and
6 MiB chunking.

Never log a raw TUS error/request because it can contain Authorization headers.
Extract only status, safe message, media ID, size, kind, retryability, and app
version. Treat `401`/`403`, timeout, network, and unknown status as retryable.
Only clearly terminal conditions such as locally verified oversize or a
specific non-auth validation error may be permanent.

**Verify**: adapter tests assert the exact token header and sanitized errors.

### 3. Introduce one durable media queue

Create `attachments.ts` with one queue for photo and audio IDs (UUIDs are
globally unique). Its watch query must union:

- `collection_photo`
- `scouting_notes_photos`
- `collection_audio`
- `scouting_notes_audio`

Resolve bucket/path/MIME type by row kind. Before every upload, acquire bounded
live credentials. If unavailable, throw a retryable error without sending.

For a permanent failure, write a local-only media failure record before telling
the queue to advance. The record includes media ID, kind, bucket/path, safe
error fields, and timestamp, but no token/request object. Retain the canonical
local bytes for explicit retry.

**Verify**: queue tests cover no session, 401/403, network error, oversize,
permanent preservation, next-item progress, and token-free diagnostics.

### 4. Make local persistence and metadata one hook-owned operation

Refactor `usePhotosMutate` and `useAudiosMutate` so callers do not separately
persist bytes. Each create operation must:

1. validate IDs and derive path;
2. persist canonical bytes locally;
3. hand bytes to the durable attachment store/queue;
4. insert PowerSync metadata with `uploaded_at: null` and a pending state;
5. return immediately without waiting for network upload.

Use AttachmentQueue's `saveFile(...updateHook)` transaction mechanism where
possible so queue registration and SQLite metadata cannot drift. Preserve a
local recovery copy in the existing photo/audio store until the new lifecycle
has shipped safely.

On upload success, set `uploaded_at` and uploaded state locally. On terminal
failure, set failed state without deleting the row or bytes.

**Verify**: hook tests prove offline creation resolves only after bytes and row
are durable, does not call Supabase directly, and survives hook unmount.

### 5. Reconcile pre-migration media idempotently

Add a versioned, restart-safe reconciliation that scans existing local photo
and audio stores. For each locally cached media ID that has a matching metadata
row but no active/complete attachment record, enqueue it using the existing
path. TUS uses upsert, so re-uploading an already-present object is safe.

Do not delete legacy stores during this plan. Record migration completion only
after the full scan succeeds; interruption must safely rerun.

**Verify**: tests seed legacy photo/audio records, interrupt reconciliation,
rerun, and assert one effective job per ID with bytes intact.

### 6. Make deletion offline-first

Current hooks delete Storage first, which cannot work offline. Reverse the
ownership: record local deletion/tombstone immediately, remove UI metadata,
and let the durable queue delete the remote object with live credentials.
Retry auth/network deletion failures. Never delete the local recovery bytes
until the local delete/tombstone is durable.

**Verify**: offline delete hides the item locally and queues remote cleanup;
restart retains cleanup; a remote 404 is treated as successful idempotent
deletion.

### 7. Start the queue independently of network availability

Update `PowerSyncProvider` so a valid local identity starts the runtime even
offline. The queue may observe and retain work, but its network adapter can use
only Plan 002 live credentials. Stop/disconnect on explicit logout, not merely
temporary credential absence.

**Verify**: provider test covers offline identity start, unavailable credential
deferral, later auth recovery, and explicit logout stop.

## Test plan

Required scenarios:

1. capture offline, restart, reconnect, upload once;
2. no session means no request and retained job;
3. exact acquired bearer token is on TUS request;
4. expired-token 401/403 remains queued;
5. one permanent bad item is preserved and item B uploads;
6. transient item A does not starve B;
7. legacy photo/audio cache migration is idempotent;
8. successful retry sets `uploaded_at` once;
9. offline deletion is durable and remote cleanup retries;
10. logs contain no bearer token.

## Done criteria

- [ ] Foreground form submission never owns a network upload.
- [ ] Photo/audio bytes and jobs survive restart before network success.
- [ ] Uploads require bounded live credentials bound to the TUS request.
- [ ] Auth/network/401/403 failures remain retryable indefinitely.
- [ ] Permanent failures preserve bytes and failure metadata before advancing.
- [ ] A failed item cannot starve later items.
- [ ] Existing cached media is reconciled without deletion.
- [ ] Tests, scoped lint, and typecheck pass.

## STOP conditions

- AttachmentQueue does not provide fair progress or reliable local-byte
  retention; use the explicit local-only dispatcher described in Step 1.
- Any migration path would delete the legacy stores before successful copy and
  verification.
- The installed PowerSync version requires a destructive schema reset to add
  local-only state.
- A proposed diagnostic serializes TUS request/response headers.

## Maintenance notes

Treat local media stores as user data, not cache, until upload success and the
retention policy are explicit. Any future media type must use the same queue
and credential boundary rather than adding another foreground uploader.

