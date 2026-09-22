import { authStorage } from "@/platform"
import { getAppMeta } from "@nasti/common/authClaims"
import { supabase } from "@nasti/common/supabase"
import {
  setNastiSessionPersistenceEnabled,
  SUPABASE_AUTH_STORAGE_KEY,
  waitForNastiSessionWrites,
} from "@nasti/common/supabaseClient"
import { ROLE, type Role } from "@nasti/common/types"
import type { Session } from "@supabase/supabase-js"
import { z } from "zod"
import { TIMED_OUT, withTimeout } from "./withTimeout"

export const OFFLINE_AUTH_KEY = "nasti-offline-auth-v1"
export const OFFLINE_ACCESS_MS = 30 * 24 * 60 * 60 * 1_000

export type OfflineAuthSnapshot = {
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

export type AuthMode = "live" | "offline" | "logged_out"
export type AuthState = {
  mode: AuthMode
  session: Session | null
  user: { id: string; email?: string; displayName?: string } | null
  claims: {
    organisation: { id: string; name: string }
    orgId: string
    role: Role | null
    isAdmin: boolean
  } | null
  isLoggedIn: boolean
  offlineAccessUntil: string | null
}

export const loggedOutAuthState: AuthState = {
  mode: "logged_out",
  session: null,
  user: null,
  claims: null,
  isLoggedIn: false,
  offlineAccessUntil: null,
}

export const getAuthStateFromSession = (session: Session | null): AuthState => {
  if (!session) return loggedOutAuthState
  const meta = getAppMeta(session)
  return {
    mode: "live",
    session,
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName:
        typeof session.user.user_metadata.name === "string"
          ? session.user.user_metadata.name
          : undefined,
    },
    claims: meta.org_id
      ? {
          organisation: { id: meta.org_id, name: meta.org_name ?? "" },
          orgId: meta.org_id,
          role: meta.role ?? null,
          isAdmin: meta.role === ROLE.ADMIN,
        }
      : null,
    isLoggedIn: true,
    offlineAccessUntil: null,
  }
}

export const getAuthStateFromSnapshot = (
  snapshot: OfflineAuthSnapshot,
): AuthState => ({
  mode: "offline",
  session: null,
  user: {
    id: snapshot.userId,
    email: snapshot.email,
    displayName: snapshot.displayName,
  },
  claims: {
    organisation: { id: snapshot.orgId, name: snapshot.orgName ?? "" },
    orgId: snapshot.orgId,
    role: snapshot.role ?? null,
    isAdmin: snapshot.role === ROLE.ADMIN,
  },
  isLoggedIn: true,
  offlineAccessUntil: snapshot.offlineAccessUntil,
})

const snapshotSchema = z
  .object({
    userId: z.string().min(1),
    email: z.string().optional(),
    displayName: z.string().optional(),
    orgId: z.string().min(1),
    orgName: z.string().optional(),
    role: z.nativeEnum(ROLE).optional(),
    lastSuccessfulLoginAt: z.string().datetime({ offset: true }),
    lastSuccessfulSessionRefreshAt: z.string().datetime({ offset: true }),
    offlineAccessUntil: z.string().datetime({ offset: true }),
  })
  .refine((snapshot) => {
    const login = Date.parse(snapshot.lastSuccessfulLoginAt)
    const refresh = Date.parse(snapshot.lastSuccessfulSessionRefreshAt)
    const deadline = Date.parse(snapshot.offlineAccessUntil)
    return login <= refresh && deadline === refresh + OFFLINE_ACCESS_MS
  })

// Serialize writes so a slow bootstrap write cannot restore a logged-out user
// after explicit deletion. Logout intentionally waits for this queue.
let pendingWrite: Promise<void> = Promise.resolve()
let authRevision = 0
let loggingOut = false
let sessionEventsAllowed = true
let retainedSnapshot: OfflineAuthSnapshot | null = null

export const isExplicitLogoutInProgress = () => loggingOut
export const areAuthSessionEventsAllowed = () => sessionEventsAllowed
export const getAuthRevision = () => authRevision
export const beginExplicitLogout = () => {
  loggingOut = true
  sessionEventsAllowed = false
  retainedSnapshot = null
  setNastiSessionPersistenceEnabled(false)
  authRevision += 1
}
export const finishExplicitLogout = () => {
  loggingOut = false
}
export const allowExplicitLogin = () => {
  sessionEventsAllowed = true
  setNastiSessionPersistenceEnabled(true)
}
export const prepareExplicitLogin = () => {
  setNastiSessionPersistenceEnabled(true)
}
export const closeFailedLoginPersistence = () => {
  if (!sessionEventsAllowed) setNastiSessionPersistenceEnabled(false)
}
export const getRetainedOfflineAuthSnapshot = () =>
  isSnapshotValid(retainedSnapshot) ? retainedSnapshot : null

export const isSnapshotValid = (
  snapshot: OfflineAuthSnapshot | null,
  now = Date.now(),
): snapshot is OfflineAuthSnapshot =>
  snapshot !== null && Date.parse(snapshot.offlineAccessUntil) > now

export const readOfflineAuthSnapshot =
  async (): Promise<OfflineAuthSnapshot | null> => {
    const revision = authRevision
    try {
      const stored = await withTimeout(
        Promise.resolve().then(() => authStorage.getItem(OFFLINE_AUTH_KEY)),
      )
      if (stored === TIMED_OUT || stored == null) return null
      const parsed = snapshotSchema.safeParse(JSON.parse(stored))
      if (parsed.success && revision === authRevision && !loggingOut) retainedSnapshot = parsed.data
      return parsed.success ? parsed.data : null
    } catch {
      // A failed/slow read must never destroy a potentially valid identity.
      return null
    }
  }

export const writeOfflineAuthSnapshot = async (
  snapshot: OfflineAuthSnapshot,
): Promise<boolean> => {
  if (loggingOut) return false
  const validated = snapshotSchema.parse(snapshot)
  retainedSnapshot = validated
  const revision = authRevision
  const write = pendingWrite.then(async () => {
    if (loggingOut || revision !== authRevision) return
    await authStorage.setItem(OFFLINE_AUTH_KEY, JSON.stringify(validated))
  })
  pendingWrite = write.catch(() => undefined)
  try {
    return (
      (await withTimeout(write)) !== TIMED_OUT &&
      revision === authRevision &&
      !loggingOut
    )
  } catch {
    return false
  }
}

/** Unbounded by design: successful logout means durable identity is gone. */
export const deleteOfflineAuthSnapshot = async () => {
  await pendingWrite
  await authStorage.removeItem(OFFLINE_AUTH_KEY)
  // Web storage may swallow deletion errors; do not report success on faith.
  if ((await authStorage.getItem(OFFLINE_AUTH_KEY)) != null) {
    throw new Error(
      "Unable to remove offline login. Please try logging out again.",
    )
  }
}

export const deletePersistedSupabaseSession = async () => {
  await waitForNastiSessionWrites()
  for (const key of [
    SUPABASE_AUTH_STORAGE_KEY,
    `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`,
  ]) {
    await authStorage.removeItem(key)
    if ((await authStorage.getItem(key)) != null) {
      throw new Error(
        "Unable to remove saved login. Please try logging out again.",
      )
    }
  }
}

export const snapshotFromSession = (
  session: Session,
  previous: OfflineAuthSnapshot | null = null,
  isLogin = false,
  now = Date.now(),
): OfflineAuthSnapshot | null => {
  const meta = getAppMeta(session)
  if (!meta.org_id) return null
  const timestamp = new Date(now).toISOString()
  return {
    userId: session.user.id,
    email: session.user.email,
    displayName:
      typeof session.user.user_metadata.name === "string"
        ? session.user.user_metadata.name
        : undefined,
    orgId: meta.org_id,
    orgName: meta.org_name,
    role: meta.role,
    lastSuccessfulLoginAt:
      !isLogin && previous?.userId === session.user.id
        ? previous.lastSuccessfulLoginAt
        : timestamp,
    lastSuccessfulSessionRefreshAt: timestamp,
    offlineAccessUntil: new Date(now + OFFLINE_ACCESS_MS).toISOString(),
  }
}

export const getAuthStateWithOfflineFallback = async (): Promise<AuthState> => {
  if (loggingOut || !sessionEventsAllowed) return loggedOutAuthState
  const revision = authRevision
  const snapshot = await readOfflineAuthSnapshot() ?? getRetainedOfflineAuthSnapshot()
  if (loggingOut || revision !== authRevision) return loggedOutAuthState
  if (isSnapshotValid(snapshot)) return getAuthStateFromSnapshot(snapshot)

  // Install the rejection handler before racing: getSession cannot be
  // cancelled and a late rejection still needs an owner.
  const lookup = Promise.resolve()
    .then(() => supabase.auth.getSession())
    .catch(() => null)
  const result = await withTimeout(lookup)
  if (loggingOut || revision !== authRevision) return loggedOutAuthState
  if (result !== TIMED_OUT && result && !result.error && result.data.session) {
    const session = result.data.session
    const refreshed = snapshotFromSession(session, snapshot)
    if (refreshed) await writeOfflineAuthSnapshot(refreshed)
    return loggingOut || revision !== authRevision
      ? loggedOutAuthState
      : getAuthStateFromSession(session)
  }
  const discovered = getRetainedOfflineAuthSnapshot()
  return discovered ? getAuthStateFromSnapshot(discovered) : loggedOutAuthState
}
