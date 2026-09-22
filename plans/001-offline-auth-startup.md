# Plan 001: Keep authenticated users in the local app for 30 days

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. If a STOP condition occurs, report it
> rather than improvising. When done, mark Plan 001 DONE in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat d3996c2..HEAD -- apps/mobile/src/main.tsx apps/mobile/src/routes/_private.tsx apps/mobile/src/routes/__root.tsx apps/mobile/src/hooks/useAuth.ts apps/mobile/src/components/app/SettingsMenu.tsx apps/mobile/src/lib apps/mobile/src/contexts packages/common/supabaseClient.ts`
> Compare all changed in-scope code with this plan before proceeding.

## Status

- **Priority**: P1
- **Effort**: M (one to two days including tests)
- **Risk**: MED — router bootstrap and logout semantics change
- **Depends on**: none
- **Category**: correctness / architecture
- **Planned at**: commit `d3996c2`, 2026-09-22

## Why this matters

The private route currently awaits `supabase.auth.getSession()` with no bound.
On weak reception that promise can stall even when `navigator.onLine` is true,
leaving the app shell unusable. NASTI also equates a live Supabase session with
permission to use local data, so an expired token can force a field user back
to login when no network is available.

After this plan, a successful login or token refresh grants a rolling 30-day
local-access window. A valid local identity unlocks the UI immediately; only an
explicit logout clears it before the deadline. This is local access, not
network authorization.

## Current state

- `apps/mobile/src/routes/_private.tsx:41-59` directly awaits the auth client:

  ```ts
  if (!context.isLoggedIn) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw redirect({ to: "/auth/login" })
    setAuthState(queryClient, session)
  }
  ```

- `apps/mobile/src/hooks/useAuth.ts:109-119` repeats the unbounded lookup and
  uses `networkMode: "online"`, although the session storage is local.
- `apps/mobile/src/hooks/useAuth.ts:96-107` makes logout online-only and clears
  only query state before the sign-out request has completed.
- The platform abstraction already provides the right durable storage seam:
  `apps/mobile/src/platform/native/authStorage.ts` uses secure storage and
  `apps/mobile/src/platform/web/authStorage.ts` uses IndexedDB.
- `apps/mobile/src/lib/supabase.ts` already injects that platform storage into
  the mobile Supabase client. Preserve this convention.

## Required design

Create two types that cannot be confused:

```ts
type OfflineAuthSnapshot = {
  userId: string
  email?: string
  displayName?: string
  orgId: string
  orgName?: string
  role?: Role
  lastSuccessfulLoginAt: string
  lastSuccessfulSessionRefreshAt: string
  offlineAccessUntil: string
}

type AuthMode = "live" | "offline" | "logged_out"
```

Do not construct a fake JWT or fake Supabase `Session`. `AuthState.session` must
be `null` in offline mode while `user`, organisation, role, and `isLoggedIn`
come from the snapshot. Network code must never accept `OfflineAuthSnapshot`.

`offlineAccessUntil` is 30 days after the most recent successful login or live
token refresh. It is a minimum local-access guarantee, not the Supabase access
token expiry. A normal auth-library `SIGNED_OUT` event caused by failed refresh
must not delete a still-valid snapshot; only the explicit logout workflow may
do that before its deadline.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm --filter nasti-mobile exec tsc --noEmit --pretty false` | exit 0 |
| Focused tests | `pnpm --filter nasti-mobile exec vitest run src/lib/__tests__/offlineAuth.test.ts src/hooks/__tests__/useAuth.test.tsx` | all pass |
| Scoped lint | `pnpm --filter nasti-mobile exec eslint src/lib/offlineAuth.ts src/lib/withTimeout.ts src/contexts/auth.tsx src/hooks/useAuth.ts src/routes/_private.tsx src/main.tsx` | exit 0 |

## Scope

**In scope**:

- Create `apps/mobile/src/lib/withTimeout.ts`.
- Create `apps/mobile/src/lib/offlineAuth.ts` and its tests.
- Create `apps/mobile/src/contexts/auth.tsx` for one auth-state listener.
- Update `packages/common/supabaseClient.ts` to export and configure the exact
  existing Supabase auth-storage key so explicit offline logout can remove the
  persisted refresh session without depending on a networked `signOut` call.
- Update `apps/mobile/src/hooks/useAuth.ts`.
- Update `apps/mobile/src/routes/_private.tsx`, `apps/mobile/src/main.tsx`, and
  router context typing in `apps/mobile/src/routes/__root.tsx`.
- Update logout handling in `apps/mobile/src/components/app/SettingsMenu.tsx`
  only if needed for error/progress presentation.
- Update the collection and scouting-note detail routes that currently read
  `user.user_metadata.name` so they consume the explicit offline-safe
  `displayName` field instead of requiring a full Supabase `User` object:
  `apps/mobile/src/routes/_private/trips/$id/collections/$collectionId/index.tsx`
  and
  `apps/mobile/src/routes/_private/trips/$id/scouting-notes/$scoutingNoteId/index.tsx`.

**Out of scope**:

- Upload credential acquisition (Plan 002).
- Web-app authentication.
- Supabase server token-lifetime configuration.
- Encrypting web IndexedDB beyond browser-origin protections.

## Git workflow

- Branch: `feat/001-offline-auth-startup`
- Conventional commits, e.g. `feat(mobile): add offline auth bootstrap`
- Do not push or open a PR unless instructed.

## Steps

### 1. Add bounded local-storage and session primitives

Implement `withTimeout()` with a unique `TIMED_OUT` sentinel. In
`offlineAuth.ts`, validate parsed snapshot fields and dates, use the platform
`authStorage`, and bound bootstrap reads/writes to five seconds. Reads must
return `null` on timeout/storage failure without deleting possibly valid data.
Malformed JSON may be removed best-effort.

Expose separate operations for:

- bounded bootstrap read/write;
- unbounded explicit-logout deletion (logout must not claim success until the
  snapshot is actually gone);
- validity checking using `offlineAccessUntil`.

**Verify**: add tests for malformed data, slow read, failed read, rolling
30-day deadline, and stalled explicit deletion. Run the focused test command.

### 2. Implement a bounded bootstrap state machine

Add `getAuthStateWithOfflineFallback()` with this order:

1. Read the snapshot with the bounded storage operation.
2. If valid, return offline auth state immediately without calling Supabase.
3. If no valid snapshot, race `supabase.auth.getSession()` against five
   seconds. Attach a rejection handler before racing because the Supabase
   promise cannot be cancelled and may reject later.
4. A real session produces live state and refreshes the snapshot.
5. Timeout, network/auth-library error, or a null session must not delete a
   still-valid snapshot discovered during this invocation.
6. With neither a real session nor valid snapshot, return logged-out state.

Do not use `navigator.onLine` to choose an unbounded path.

**Verify**: fake-timer tests must prove a valid snapshot never calls
`getSession`, a stalled online lookup resolves within five seconds, and a late
rejection is consumed.

### 3. Make auth state single-source and subscription-driven

Refactor `useAuth.ts` so its query stores the full `AuthState`, including
`mode`. Add `getAuthStateFromSession` and `getAuthStateFromSnapshot` helpers.
Create one provider/listener in `contexts/auth.tsx`, mounted once from
`main.tsx`, that mirrors real Supabase sessions on `INITIAL_SESSION`,
`SIGNED_IN`, and `TOKEN_REFRESHED`, and refreshes the offline snapshot.

On auth-library `SIGNED_OUT`, retain a valid snapshot unless the explicit
logout flow set a local logout-in-progress marker. This prevents refresh
failure from becoming user logout.

Remove `getSession` from router context; no UI route should expose a raw
credential lookup.

**Verify**: `useAuth` tests cover live state, offline state with
`session === null`, listener refresh, and no duplicate listener registration.

### 4. Route using bounded bootstrap

Replace the direct call in `_private.tsx` with
`getAuthStateWithOfflineFallback()`, seed the auth query, and return as soon as
either live or valid offline identity exists. Redirect only when both are
absent. Keep the existing suspense/error UI.

The route must not clear local project/data state merely because request
credentials are temporarily unavailable.

**Verify**: add route-level or helper tests for valid offline cold start,
expired snapshot, no snapshot/no session, and online-but-stalled lookup.

### 5. Make explicit logout authoritative and offline-capable

Set logout mutation `networkMode: "always"`. Its ordered behavior is:

1. mark explicit logout in progress and clear in-memory auth state;
2. delete the offline snapshot and await completion;
3. attempt global/server sign-out best-effort;
4. attempt local Supabase sign-out, then explicitly remove and verify absence
   of the configured Supabase auth-storage key because the installed auth-js
   implementation can return on a retryable network failure before clearing
   storage;
5. invalidate the router and navigate to login;
6. clear the logout marker in `finally`.

If snapshot deletion fails, show an error and do not present logout as
complete; otherwise a cold start could silently restore local access.
Because the current web `authStorage.removeItem` intentionally swallows its
underlying IndexedDB/localStorage errors, explicitly read the snapshot key back
after deletion and fail logout if it is still present or cannot be verified as
absent. Native secure-storage deletion already rejects on failure.

**Verify**: tests cover offline logout, failed global sign-out, stalled
snapshot deletion, and cold-start non-restoration after success.

## Test plan

Create `apps/mobile/src/lib/__tests__/offlineAuth.test.ts` modeled on existing
Vitest tests under `apps/mobile/src/hooks/__tests__`. Cover at minimum:

1. valid snapshot returns immediately without Supabase;
2. live session refreshes a 30-day window;
3. online-but-stalled `getSession` is bounded;
4. expired snapshot with no session is logged out;
5. storage failure does not delete data;
6. late auth rejection is handled;
7. offline mode has no `Session` or bearer token;
8. only explicit logout removes a valid snapshot.

## Done criteria

- [ ] A valid snapshot unlocks the local app for 30 rolling days.
- [ ] Startup auth/storage awaits are bounded to five seconds.
- [ ] Offline identity is not represented as a Supabase `Session`.
- [ ] No automatic refresh failure clears a valid snapshot.
- [ ] Explicit logout clears both snapshot and persisted Supabase session.
- [ ] Focused tests, scoped lint, and typecheck pass.
- [ ] No bearer token or auth-storage value is logged.
- [ ] Only in-scope files plus `plans/README.md` changed.

## STOP conditions

- A consumer outside the listed mobile files requires more Supabase `User`
  state than `id`, `email`, and the explicit `displayName`; report the expanded
  blast radius before changing its public type.
- Supabase emits no distinguishable event sequence for explicit versus refresh
  sign-out; retain the snapshot by default and report the observation.
- Secure-storage deletion cannot be awaited reliably on native.
- Any implementation requires putting access or refresh tokens in the offline
  snapshot.

## Maintenance notes

The offline deadline is a product/security policy. Changing it must update
tests and user-facing copy. Reviewers should scrutinize every future import of
`OfflineAuthSnapshot`: it is suitable for local attribution and UI only.
