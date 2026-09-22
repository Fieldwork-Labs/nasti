import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "@supabase/supabase-js"
import { authStorage } from "@/platform"
import { supabase } from "@nasti/common/supabase"
import {
  deleteOfflineAuthSnapshot,
  allowExplicitLogin,
  beginExplicitLogout,
  finishExplicitLogout,
  getAuthStateWithOfflineFallback,
  OFFLINE_ACCESS_MS,
  OFFLINE_AUTH_KEY,
  readOfflineAuthSnapshot,
  snapshotFromSession,
  writeOfflineAuthSnapshot,
} from "../offlineAuth"

vi.mock("@/platform", () => ({
  authStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock("@nasti/common/supabase", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}))

const now = Date.parse("2026-09-22T00:00:00Z")
const session = {
  access_token: `header.${btoa(JSON.stringify({ app_metadata: { org_id: "org-1", role: "Admin" } }))}.signature`,
  refresh_token: "real-session-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user: {
    id: "user-1",
    email: "user@example.com",
    user_metadata: { name: "Field User" },
    app_metadata: {},
    created_at: "",
    aud: "authenticated",
  },
} satisfies Session
const snapshot = snapshotFromSession(session, null, true, now)!

beforeEach(() => {
  beginExplicitLogout()
  finishExplicitLogout()
  allowExplicitLogin()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.mocked(authStorage.getItem).mockReset().mockResolvedValue(null)
  vi.mocked(authStorage.setItem).mockReset().mockResolvedValue(undefined)
  vi.mocked(authStorage.removeItem).mockReset().mockResolvedValue(undefined)
  vi.mocked(supabase.auth.getSession)
    .mockReset()
    .mockResolvedValue({ data: { session: null }, error: null })
})

describe("bounded auth bootstrap", () => {
  it("unlocks a valid offline cold start without acquiring credentials", async () => {
    vi.mocked(authStorage.getItem).mockResolvedValue(JSON.stringify(snapshot))
    const state = await getAuthStateWithOfflineFallback()
    expect(state).toMatchObject({
      mode: "offline",
      session: null,
      user: { id: "user-1" },
      isLoggedIn: true,
    })
    expect(JSON.stringify(state)).not.toContain("token")
    expect(supabase.auth.getSession).not.toHaveBeenCalled()
  })

  it("refreshes the local window from a real session", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session },
      error: null,
    })
    expect(await getAuthStateWithOfflineFallback()).toMatchObject({
      mode: "live",
      session,
    })
    const stored = JSON.parse(vi.mocked(authStorage.setItem).mock.calls[0]![1])
    expect(Date.parse(stored.offlineAccessUntil)).toBe(now + OFFLINE_ACCESS_MS)
    expect(stored).not.toHaveProperty("access_token")
    expect(stored).not.toHaveProperty("refresh_token")
  })

  it("bounds an online but stalled credential lookup to five seconds", async () => {
    expect(navigator.onLine).toBe(true)
    vi.mocked(supabase.auth.getSession).mockReturnValue(
      new Promise(() => undefined),
    )
    const bootstrap = getAuthStateWithOfflineFallback()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await bootstrap).toMatchObject({ mode: "logged_out", session: null })
  })

  it("consumes a credential rejection after the timeout", async () => {
    let rejectLookup!: (error: Error) => void
    vi.mocked(supabase.auth.getSession).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectLookup = reject
      }),
    )
    const bootstrap = getAuthStateWithOfflineFallback()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await bootstrap).toMatchObject({ mode: "logged_out" })
    rejectLookup(new Error("late network failure"))
    await vi.advanceTimersByTimeAsync(0)
    expect(authStorage.removeItem).not.toHaveBeenCalled()
  })

  it("logs out an expired snapshot without a session", async () => {
    vi.mocked(authStorage.getItem).mockResolvedValue(JSON.stringify(snapshot))
    vi.setSystemTime(now + OFFLINE_ACCESS_MS)
    expect(await getAuthStateWithOfflineFallback()).toMatchObject({
      mode: "logged_out",
    })
    expect(authStorage.removeItem).not.toHaveBeenCalled()
  })

  it("logs out when neither snapshot nor session exists", async () => {
    expect(await getAuthStateWithOfflineFallback()).toMatchObject({
      mode: "logged_out",
    })
  })
})
afterEach(() => vi.useRealTimers())

describe("offline auth storage", () => {
  it.each([
    "not-json",
    "{}",
    JSON.stringify({ ...snapshot, userId: "" }),
    JSON.stringify({ ...snapshot, offlineAccessUntil: "invalid" }),
    JSON.stringify({ ...snapshot, role: "Superuser" }),
  ])("rejects malformed snapshot %s", async (stored) => {
    vi.mocked(authStorage.getItem).mockResolvedValue(stored)
    expect(await readOfflineAuthSnapshot()).toBeNull()
  })

  it("bounds a stalled read without deleting data", async () => {
    vi.mocked(authStorage.getItem).mockReturnValue(new Promise(() => undefined))
    const read = readOfflineAuthSnapshot()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await read).toBeNull()
    expect(authStorage.removeItem).not.toHaveBeenCalled()
  })

  it("leaves storage untouched after a failed read", async () => {
    vi.mocked(authStorage.getItem).mockRejectedValue(
      new Error("storage unavailable"),
    )
    expect(await readOfflineAuthSnapshot()).toBeNull()
    expect(authStorage.removeItem).not.toHaveBeenCalled()
  })

  it("rolls the 30-day window on refresh while preserving the login date", async () => {
    const refreshed = snapshotFromSession(
      session,
      snapshot,
      false,
      now + 1_000,
    )!
    expect(refreshed.lastSuccessfulLoginAt).toBe(snapshot.lastSuccessfulLoginAt)
    expect(Date.parse(refreshed.offlineAccessUntil)).toBe(
      now + 1_000 + OFFLINE_ACCESS_MS,
    )
    expect(await writeOfflineAuthSnapshot(refreshed)).toBe(true)
    expect(authStorage.setItem).toHaveBeenCalledWith(
      OFFLINE_AUTH_KEY,
      JSON.stringify(refreshed),
    )
  })

  it("never reports a stalled explicit deletion as complete", async () => {
    let resolveDeletion!: () => void
    vi.mocked(authStorage.removeItem).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDeletion = resolve
      }),
    )
    const done = vi.fn()
    const deletion = deleteOfflineAuthSnapshot().then(done)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(done).not.toHaveBeenCalled()
    resolveDeletion()
    await deletion
    expect(done).toHaveBeenCalledOnce()
  })

  it("detects swallowed deletion errors with a read back", async () => {
    vi.mocked(authStorage.getItem).mockResolvedValue(JSON.stringify(snapshot))
    await expect(deleteOfflineAuthSnapshot()).rejects.toThrow(
      "Unable to remove offline login",
    )
  })
})
