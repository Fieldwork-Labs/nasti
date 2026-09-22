# Plan 002: Authenticate and classify every row upload attempt

> **Executor instructions**: Complete Plan 001 first. Follow each step and
> verification. Mark Plan 002 DONE in `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat d3996c2..HEAD -- packages/common/supabaseClient.ts apps/mobile/src/lib/auth apps/mobile/src/lib/powersync/connector.ts apps/mobile/src/lib/powersync/schema.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — changes queue completion and authorization classification
- **Depends on**: `plans/001-offline-auth-startup.md`
- **Category**: correctness / security / architecture
- **Planned at**: commit `d3996c2`, 2026-09-22

## Why this matters

NASTI currently sends row mutations through the shared Supabase client without
first acquiring bounded live credentials. It then classifies every PostgreSQL
`42501` as permanent, writes the operation to `sync_failures`, and completes
the queue transaction. A transient refresh failure can therefore be mistaken
for a genuine RLS denial.

The rule after this plan is: **authentication uncertainty is retryable; only a
policy denial made with the exact, server-confirmed token used by the request
is permanent**.

## Current state

- `apps/mobile/src/lib/powersync/connector.ts:169-185` calls the unbounded shared
  auth client for PowerSync credentials.
- `connector.ts:209-229` performs PostgREST requests through the shared client,
  so the token used is not proven.
- `connector.ts:41-43` includes `42501` in unconditional permanent errors.
- `connector.ts:240-245` preserves then completes every such transaction.
- `connector.ts:156` keeps dependency retry counts only in memory; app restart
  resets them, allowing one bad FIFO transaction to block later rows forever.
- The existing `sync_failures` table and save-before-complete order are useful
  and should be retained.

## Required interface

Create a small credential seam:

```ts
type RequestCredentials = { accessToken: string }

interface UploadCredentials {
  acquire(timeoutMs?: number): Promise<RequestCredentials | null>
  confirm(credentials: RequestCredentials, timeoutMs?: number): Promise<boolean>
}
```

`acquire(null)` means “do not send; leave queued,” never “log out.” The default
acquisition timeout is 30 seconds to tolerate poor field connectivity while
still bounding a stuck refresh. Confirmation asks the auth server about the
exact token and defaults to 10 seconds. Tokens must never appear in logs,
telemetry, failure payloads, or stable storage outside Supabase auth storage.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm --filter nasti-mobile exec vitest run src/lib/auth/__tests__/liveSession.test.ts src/lib/powersync/__tests__/connector.test.ts` | all pass |
| Typecheck | `pnpm --filter nasti-mobile exec tsc --noEmit --pretty false` | exit 0 |
| Lint | `pnpm --filter nasti-mobile exec eslint src/lib/auth/liveSession.ts src/lib/powersync/connector.ts src/lib/powersync/__tests__/connector.test.ts` | exit 0 |

## Scope

**In scope**:

- Add `createNastiSupabaseClientForToken()` to
  `packages/common/supabaseClient.ts`.
- Create `apps/mobile/src/lib/auth/liveSession.ts` and tests.
- Refactor `apps/mobile/src/lib/powersync/connector.ts` and add connector tests.
- Add durable retry-state schema only if localStorage cannot meet the tested
  lifecycle requirement.

**Out of scope**:

- Media uploads (Plan 003).
- Changing server RLS policies.
- Automatically retrying/editing entries already in `sync_failures` (Plan 004).
- Treating offline identity as credentials.

## Git workflow

- Branch: `feat/002-authenticated-row-upload`
- Conventional commits, e.g. `fix(sync): retain rows when auth is uncertain`

## Steps

### 1. Add bounded live credential acquisition

Implement `acquire` with Plan 001's timeout utility around
`supabase.auth.getSession()`. Convert timeout, network error, auth-library
error, and missing session to `null`. Consume late rejection from the
uncancellable auth promise.

Implement `confirm` using `supabase.auth.getUser(accessToken)` so confirmation
does not depend on whatever session the shared client currently holds. Any
timeout/error/rejection returns `false`.

**Verify**: live-session tests cover success, timeout, missing session, late
rejection, accepted token, rejected token, and confirmation timeout.

### 2. Add an exact-token Supabase client

In `packages/common/supabaseClient.ts`, add a factory using Supabase's
`accessToken: async () => accessToken` option. It must not use auth storage,
refresh, swap, or drop the supplied token. Cache at most one token-bound client
inside the connector and replace it when the token changes.

Do not log or persist the token. Tests should assert row calls use the
token-bound client and never `supabase.from()` on the shared client.

**Verify**: connector happy-path tests inspect the factory argument and request
dispatch, without printing token values.

### 3. Gate every row transaction on credentials

In `uploadData`, obtain the next transaction, wait for connectivity only as a
hint, then call `acquire`. If credentials are unavailable, throw/return in the
form PowerSync interprets as retryable without calling `transaction.complete`.

Use the token-bound client for every PUT, PATCH, and DELETE in that transaction.
Keep operations idempotent: PUT remains upsert; PATCH sets deterministic values;
DELETE of an absent row remains success.

Use the same live credential seam for `fetchCredentials`. A failed acquisition
must defer connection, not change UI login state.

**Verify**: no-session and timeout tests assert no network row call, no failure
record, and no completion.

### 4. Classify `42501` using the exact request token

Remove `42501` from unconditional permanent handling. When the token-bound row
request returns `42501`:

1. call `confirm` with the exact `RequestCredentials` used for that request;
2. if unconfirmed, leave the transaction queued indefinitely;
3. if confirmed, save every operation to `sync_failures`, then complete once so
   later transactions can proceed.

If saving the failure record fails, do not complete the transaction. Preserve
the existing safe-complete behavior: a failed completion leaves the original
queue entry available for replay.

**Verify**: tests reproduce the time-of-check/time-of-use case where auth state
changes after failure; the disposition depends only on the captured request
credentials.

### 5. Make non-auth permanent/dependency policy durable

Keep validation/check errors such as `23514` permanent: preserve then complete.
Keep network, timeout, `401`, `403`, and unknown errors retryable without a
small fixed budget.

Persist the `23503` dependency retry counter across reloads using a stable key
derived from all transaction operations (table, id, op), not just the first
operation. Clear it on success or parking. After the tested budget, preserve
all operations and complete so a truly broken row cannot wedge the FIFO queue.

**Verify**: reload the module between attempts in a test and prove the counter
continues; also prove a parked bad transaction allows the next transaction to
run.

### 6. Add safe telemetry

Record only operation count, table/op summary, PostgreSQL code, disposition,
retry count, and app version. Never attach the request/client/error object for
auth or TUS errors because headers may contain tokens.

**Verify**: a test stringifies captured diagnostics and asserts the access token
and `authorization` header are absent.

## Test plan

Create `apps/mobile/src/lib/powersync/__tests__/connector.test.ts` with fake
transactions/database, modeled on `crud.test.ts`. Required cases:

1. exact acquired token is bound to PUT/PATCH/DELETE;
2. no credentials means no send and no completion;
3. network failure remains queued;
4. anonymous/expired-token `42501` remains queued;
5. auth recovery after failure does not change classification of the captured
   token;
6. confirmed RLS denial is preserved before completion;
7. validation error is preserved before completion;
8. durable dependency retries eventually park and unblock the next row;
9. partial transaction replay is idempotent;
10. diagnostics contain no bearer token.

## Done criteria

- [ ] Every row request uses one acquired, exact token.
- [ ] Credential acquisition and confirmation are bounded.
- [ ] Auth/network uncertainty never consumes the queue entry.
- [ ] Confirmed permanent failures are preserved before completion.
- [ ] Dependency retry counts survive module/app restart.
- [ ] One permanent row cannot block later rows.
- [ ] Tests, scoped lint, and typecheck pass.

## STOP conditions

- The installed Supabase client cannot bind a supplied token to every request;
  use a fetch adapter that writes the `Authorization` header explicitly and
  report the deviation.
- PowerSync interprets the chosen no-credential return as completion; prove the
  correct retry signal before proceeding.
- A stable transaction key cannot be derived from the available CRUD payload.
- Preserving a failed transaction would require storing a bearer token.

## Maintenance notes

Do not add auth errors to a generic fixed retry budget. Review any new
“permanent” code by asking whether the exact request authentication is proven.

