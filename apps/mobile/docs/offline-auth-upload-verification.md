# Offline authentication and upload verification

Run this matrix against a build installed as a Capacitor Android app and as a
PWA in a fresh browser profile. Use a test account and disposable organization.
Record the app build, device/browser version, date, and operator with each run.
This is a repeatable manual verification guide; the matrix below has not yet
been run, so the feature is not marked production-verified.

## Setup and evidence

Before starting, confirm the test account can create trips, collections,
scouting notes, photos, and audio. Prepare controls to block and restore the
test device's network, expire or revoke its access token, inject the described
row and Storage responses, and inspect the test Supabase database and Storage
bucket. Record these values at each checkpoint:

- PowerSync upload queue count from `getUploadQueueStats()` and media job counts
  by status (`pending`, `uploading`, `failed`, `uploaded`, `deleting`,
  `complete`).
- Supabase rows by known test IDs and Storage objects by generated test paths.
- Visible app state, elapsed cold-start time, and user-facing safe messages.
- Local `sync_failures` and `media_upload_failures` counts, plus whether the
  photo/audio bytes remain in the device cache.
- Local `row_delete_retry_jobs` counts by status (`pending`, `sending`,
  `failed`) and confirm that dismissing a notice does not remove its job.

Never copy access tokens, request headers, captions, filenames, coordinates,
or captured payloads into the run record. Use only synthetic field values.

## Matrix

| # | Action | Expected local state | Expected remote state and safe log |
|---|---|---|---|
| 1 | Sign in, wait for an initial sync, force the live access token to expire, block DNS/HTTP, and cold-start the app. | The locally saved identity opens the app within five seconds. Network work stays queued. No login redirect occurs. | No new requests succeed. Safe status reports sync paused and local work is safe; logs contain disposition/category and safe status code only. |
| 2 | With the network still blocked, create a trip and collection, capture a photo, and record audio. Force-close and reopen. | The rows are visible locally; media bytes and durable media jobs survive restart. | No corresponding remote rows or objects yet. Queue counts equal the outstanding row/media work. |
| 3 | Restore network and live authentication. Wait for queues to drain. | Each item leaves its pending queue once; no permanent failure remains for successful items. | Each row is present once by its test ID and each Storage path has one object. Photos/audio appear uploaded in local metadata. |
| 4 | Keep `navigator.onLine === true` but stall authentication refresh/session acquisition. Add another row and media item, then wait through multiple retry intervals. | Row and media work remain queued; the app stays usable. Status says sync paused and local work is safe. | No anonymous request is sent, no request has a missing/stale bearer token, and no item is completed. |
| 5 | Inject an anonymous or expired-token `42501` for a row upload. | The row failure is not classified as permanent unless the exact request's credentials and denial are confirmed. It stays queued after ambiguous authorization failure. | No row is silently discarded. Safe telemetry records the retry disposition without request or row data. |
| 6 | Inject a confirmed RLS denial for a row and make a later queued row valid. | The failed operation is saved in `sync_failures` before queue advancement; the next operation progresses. Both rows remain represented locally. | The denied row is absent remotely; the later valid row appears once. Settings shows a Sync issues badge. |
| 7 | Inject one terminal media response (for example, a sanitized 413) followed by a valid media job. | The failure is saved in `media_upload_failures`; captured bytes remain in the photo/audio cache; later media progresses. | The failed object is absent and the later object exists once. The safe message contains no filename, caption, or token. |
| 8 | Open Settings → Sync issues. Retry the row and media failures after correcting the injected server condition. | PUT/PATCH and media notices clear only after local write or queue registration. DELETE retries create or requeue one job and keep the failure visible until remote success. Media bytes remain until normal lifecycle cleanup. | The rows/objects appear once. No duplicate retry clicks create duplicate remote objects. |
| 9 | Dismiss a remaining failure and confirm the prompt. | Only the failure notice is removed. The record/media remains in normal local views and preserved media bytes are not deleted. | No remote delete occurs as a result of dismissing. |
| 10 | Block network, log out, force-close, and cold-start. | Logout clears local offline identity and persisted session. App remains logged out after restart. | No logout request is required to complete the local transition. |
| 11 | Queue a DELETE whose target row is already absent locally; dismiss it while pending, then cause a confirmed terminal failure and restart before restoring the endpoint. | Exactly one job exists under the failure ID; no target row is inserted, updated, or locally deleted by retry. Dismiss hides the pending notice but leaves the job. If it later fails terminally, a job-backed issue reappears with a Retry action and Settings badge. A fresh `sending` lease is not reclaimed by another tab; an expired lease recovers after restart. | The outgoing request is `DELETE /rest/v1/<allowlisted-table>?id=eq.<id>` with the acquired bearer token. No PUT/POST is emitted. A terminal job remains inspectable while the next due job progresses. |
| 12 | Restore credentials/network and retry the terminal server condition. | On remote success (including already absent/404), the job and matching failure are removed atomically. Failed terminal jobs remain visible until a later successful attempt. | Remote row is absent; only the allowlisted DELETE request was sent, with no payload or token in logs. |

## Run record

Complete one table per target. A run is complete only after all checkpoints
have evidence and the unresolved outcomes are documented.

| Target | Build | Device/browser | Date/operator | Result and evidence location |
|---|---|---|---|---|
| Android Capacitor | Not run | — | — | — |
| PWA browser profile | Not run | — | — | — |
