import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { StrictMode, type ReactNode } from "react"
import {
  AuthRetryableFetchError,
  type AuthChangeEvent,
  type Session,
} from "@supabase/supabase-js"
import { supabase } from "@nasti/common/supabase"
import { authStorage } from "@/platform"
import { AuthProvider } from "@/contexts/auth"
import {
  allowExplicitLogin,
  beginExplicitLogout,
  finishExplicitLogout,
  getAuthStateWithOfflineFallback,
  isExplicitLogoutInProgress,
  snapshotFromSession,
  OFFLINE_AUTH_KEY,
  OFFLINE_ACCESS_MS,
} from "@/lib/offlineAuth"
import {
  SUPABASE_AUTH_STORAGE_KEY,
  withSessionPersistenceGate,
} from "@nasti/common/supabaseClient"
import { authStateQueryKey, useAuth } from "../useAuth"

vi.mock("@/platform", () => ({
  authStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}))
vi.mock("@nasti/common/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}))

const session: Session = {
  access_token:
    "header." +
    btoa(
      JSON.stringify({
        app_metadata: {
          org_id: "org-123",
          org_name: "Test Organization",
          role: "Admin",
        },
      }),
    ) +
    ".signature",
  refresh_token: "refresh-123",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: "user-123",
    email: "test@example.com",
    user_metadata: { name: "Test User" },
    app_metadata: {},
    aud: "authenticated",
    created_at: "",
  },
}
const callbacks = new Set<
  (event: AuthChangeEvent, session: Session | null) => void
>()
let stored: Map<string, string>
let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
const providerWrapper = ({ children }: { children: ReactNode }) =>
  wrapper({
    children: (
      <StrictMode>
        <AuthProvider>{children}</AuthProvider>
      </StrictMode>
    ),
  })
const emit = (event: AuthChangeEvent, value: Session | null) =>
  act(() => {
    callbacks.forEach((callback) => callback(event, value))
  })

beforeEach(() => {
  vi.resetAllMocks()
  beginExplicitLogout()
  finishExplicitLogout()
  allowExplicitLogin()
  onlineManager.setOnline(true)
  callbacks.clear()
  stored = new Map()
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  vi.mocked(authStorage.getItem).mockImplementation(
    async (key) => stored.get(key) ?? null,
  )
  vi.mocked(authStorage.setItem).mockImplementation(async (key, value) => {
    stored.set(key, value)
  })
  vi.mocked(authStorage.removeItem).mockImplementation(async (key) => {
    stored.delete(key)
  })
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: null },
    error: null,
  })
  vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null })
  vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
    callbacks.add(callback)
    return {
      data: {
        subscription: {
          id: "test",
          callback,
          unsubscribe: () => {
            callbacks.delete(callback)
          },
        },
      },
    }
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.useRealTimers()
  onlineManager.setOnline(true)
})

describe("useAuth", () => {
  it("returns logged-out state without identity or session", async () => {
    const { result } = renderHook(useAuth, { wrapper })
    await waitFor(() =>
      expect(client.getQueryState(authStateQueryKey)?.status).toBe("success"),
    )
    expect(result.current).toMatchObject({
      mode: "logged_out",
      session: null,
      user: null,
      isLoggedIn: false,
    })
  })

  it("derives live identity and organisation from the real session", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session },
      error: null,
    })
    const { result } = renderHook(useAuth, { wrapper })
    await waitFor(() => expect(result.current.mode).toBe("live"))
    expect(result.current.session).toEqual(session)
    expect(result.current.user).toEqual({
      id: session.user.id,
      email: session.user.email,
      displayName: "Test User",
    })
    expect(result.current.organisation).toEqual({
      id: "org-123",
      name: "Test Organization",
    })
    expect(result.current.role).toBe("Admin")
  })

  it("exposes offline identity without a Supabase Session", async () => {
    stored.set(OFFLINE_AUTH_KEY, JSON.stringify(snapshotFromSession(session)))
    const { result } = renderHook(useAuth, { wrapper })
    await waitFor(() => expect(result.current.mode).toBe("offline"))
    expect(result.current.session).toBeNull()
    expect(result.current.isLoggedIn).toBe(true)
    expect(supabase.auth.getSession).not.toHaveBeenCalled()
  })

  it("login persists identity and derives JWT claims", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: session.user, session },
      error: null,
    })
    const { result } = renderHook(useAuth, { wrapper })
    await act(() =>
      result.current.login.mutateAsync({
        email: "test@example.com",
        password: "pw",
      }),
    )
    await waitFor(() => expect(result.current.mode).toBe("live"))
    expect(result.current.organisation?.id).toBe("org-123")
    expect(stored.has(OFFLINE_AUTH_KEY)).toBe(true)
  })

  it("leaves organisation absent when no org claims exist", async () => {
    const withoutClaims = {
      ...session,
      access_token: "header." + btoa("{}") + ".signature",
    }
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: session.user, session: withoutClaims },
      error: null,
    })
    const { result } = renderHook(useAuth, { wrapper })
    await act(() =>
      result.current.login.mutateAsync({
        email: "test@example.com",
        password: "pw",
      }),
    )
    await waitFor(() => expect(result.current.isLoggedIn).toBe(true))
    expect(result.current.organisation).toBeNull()
    expect(result.current.role).toBeNull()
  })

  it("presents retryable login failures as a connection error", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError("Fetch failed", 502),
    })
    const { result } = renderHook(useAuth, { wrapper })
    await act(async () => {
      await expect(
        result.current.login.mutateAsync({
          email: "test@example.com",
          password: "pw",
        }),
      ).rejects.toThrow("Unable to connect to server")
    })
  })
})

describe("auth subscription", () => {
  it("maintains one active listener with multiple consumers and StrictMode", async () => {
    const { result, unmount } = renderHook(() => [useAuth(), useAuth()], {
      wrapper: providerWrapper,
    })
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(callbacks.size).toBe(1)
    unmount()
    expect(callbacks.size).toBe(0)
  })

  it.each(["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"] as const)(
    "mirrors %s and refreshes the snapshot",
    async (event) => {
      const { result } = renderHook(useAuth, { wrapper: providerWrapper })
      await waitFor(() => expect(result.current).not.toBeNull())
      emit(event, session)
      await waitFor(() => expect(result.current.mode).toBe("live"))
      await waitFor(() => expect(stored.has(OFFLINE_AUTH_KEY)).toBe(true))
      expect(JSON.parse(stored.get(OFFLINE_AUTH_KEY)!)).toMatchObject({
        userId: "user-123",
        orgId: "org-123",
      })
    },
  )

  it("retains valid local access after auth-library SIGNED_OUT", async () => {
    stored.set(OFFLINE_AUTH_KEY, JSON.stringify(snapshotFromSession(session)))
    const { result } = renderHook(useAuth, { wrapper: providerWrapper })
    await waitFor(() => expect(result.current?.mode).toBe("offline"))
    emit("SIGNED_IN", session)
    await waitFor(() => expect(result.current.mode).toBe("live"))
    emit("SIGNED_OUT", null)
    await waitFor(() => expect(result.current.mode).toBe("offline"))
    expect(result.current.session).toBeNull()
    expect(authStorage.removeItem).not.toHaveBeenCalled()
  })

  it("does not let a delayed bootstrap overwrite a newer auth event", async () => {
    let finishBootstrapRead!: (value: string | null) => void
    vi.mocked(authStorage.getItem).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishBootstrapRead = resolve
        }),
    )
    const { result } = renderHook(useAuth, { wrapper: providerWrapper })
    await waitFor(() => expect(callbacks.size).toBe(1))

    emit("SIGNED_IN", session)
    await waitFor(() => expect(result.current?.mode).toBe("live"))
    finishBootstrapRead(null)
    await waitFor(() => expect(result.current.mode).toBe("live"))
    expect(result.current.session).toEqual(session)
  })

  it("expires offline access while the app remains open", async () => {
    const expiresIn = 500
    stored.set(
      OFFLINE_AUTH_KEY,
      JSON.stringify(
        snapshotFromSession(
          session,
          null,
          true,
          Date.now() - OFFLINE_ACCESS_MS + expiresIn,
        ),
      ),
    )
    const { result } = renderHook(useAuth, { wrapper: providerWrapper })
    await waitFor(() => expect(result.current?.mode).toBe("offline"))
    await waitFor(() => expect(result.current.mode).toBe("logged_out"))
    expect(authStorage.removeItem).not.toHaveBeenCalled()
  })
})

describe("explicit logout", () => {
  const seedLogin = () => {
    stored.set(OFFLINE_AUTH_KEY, JSON.stringify(snapshotFromSession(session)))
    stored.set(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify(session))
  }

  it("works offline and verifies credentials are removed before navigation", async () => {
    seedLogin()
    onlineManager.setOnline(false)
    vi.mocked(supabase.auth.signOut).mockResolvedValue({
      error: new AuthRetryableFetchError("offline", 0),
    })
    const navigate = vi.fn(async () => {
      expect(stored.has(OFFLINE_AUTH_KEY)).toBe(false)
      expect(stored.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(false)
      expect(isExplicitLogoutInProgress()).toBe(true)
    })
    const { result } = renderHook(() => useAuth({ onLogout: navigate }), {
      wrapper: providerWrapper,
    })
    await waitFor(() => expect(result.current?.mode).toBe("offline"))
    await act(() => result.current.logout.mutateAsync())
    expect(supabase.auth.signOut).toHaveBeenNthCalledWith(1, {
      scope: "global",
    })
    expect(supabase.auth.signOut).toHaveBeenNthCalledWith(2, { scope: "local" })
    expect(navigate).toHaveBeenCalledOnce()
    expect(isExplicitLogoutInProgress()).toBe(false)
    await waitFor(() => expect(result.current.isLoggedIn).toBe(false))
    // Simulate a fresh module lifetime after reload; storage is authoritative.
    allowExplicitLogin()
    expect(await getAuthStateWithOfflineFallback()).toMatchObject({
      mode: "logged_out",
    })
  })

  it("completes local removal when global sign-out rejects", async () => {
    seedLogin()
    vi.mocked(supabase.auth.signOut).mockRejectedValueOnce(
      new Error("network down"),
    )
    const { result } = renderHook(useAuth, { wrapper })
    await waitFor(() => expect(result.current.mode).toBe("offline"))
    await act(() => result.current.logout.mutateAsync())
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(2)
    expect(stored.size).toBe(0)
  })

  it("does not complete or navigate while snapshot deletion is stalled", async () => {
    seedLogin()
    let finishDeletion!: () => void
    vi.mocked(authStorage.removeItem).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDeletion = () => {
            stored.delete(OFFLINE_AUTH_KEY)
            resolve()
          }
        }),
    )
    const navigate = vi.fn(async () => undefined)
    const { result } = renderHook(() => useAuth({ onLogout: navigate }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.mode).toBe("offline"))
    vi.useFakeTimers()
    let logout!: Promise<void>
    act(() => {
      logout = result.current.logout.mutateAsync()
    })
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(result.current.logout.isPending).toBe(true)
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    await act(async () => {
      finishDeletion()
      await logout
    })
    expect(navigate).toHaveBeenCalledOnce()
  })

  it("reports deletion failures and never presents logout as complete", async () => {
    seedLogin()
    vi.mocked(authStorage.removeItem).mockResolvedValue(undefined)
    const navigate = vi.fn(async () => undefined)
    const { result } = renderHook(() => useAuth({ onLogout: navigate }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.mode).toBe("offline"))
    await act(async () => {
      await expect(result.current.logout.mutateAsync()).rejects.toThrow(
        "Unable to remove offline login",
      )
    })
    expect(navigate).not.toHaveBeenCalled()
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    expect(stored.has(OFFLINE_AUTH_KEY)).toBe(true)
    expect(isExplicitLogoutInProgress()).toBe(false)
  })

  it("bounds both stalled sign-out attempts and still removes local credentials", async () => {
    seedLogin()
    vi.mocked(supabase.auth.signOut).mockReturnValue(
      new Promise(() => undefined),
    )
    const { result } = renderHook(useAuth, { wrapper })
    await waitFor(() => expect(result.current.mode).toBe("offline"))
    vi.useFakeTimers()
    let logout!: Promise<void>
    act(() => {
      logout = result.current.logout.mutateAsync()
    })
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    await logout
    expect(stored.size).toBe(0)
  })

  it("blocks late refresh events and writes after logout, then re-enables explicit login", async () => {
    seedLogin()
    const gatedStorage = withSessionPersistenceGate(authStorage)
    const { result } = renderHook(useAuth, { wrapper: providerWrapper })
    await waitFor(() => expect(result.current?.mode).toBe("offline"))
    await act(() => result.current.logout.mutateAsync())
    await gatedStorage.setItem(
      SUPABASE_AUTH_STORAGE_KEY,
      JSON.stringify(session),
    )
    emit("TOKEN_REFRESHED", session)
    expect(stored.size).toBe(0)
    await waitFor(() => expect(result.current.mode).toBe("logged_out"))
    vi.mocked(supabase.auth.signInWithPassword).mockImplementation(async () => {
      await gatedStorage.setItem(
        SUPABASE_AUTH_STORAGE_KEY,
        JSON.stringify(session),
      )
      return { data: { user: session.user, session }, error: null }
    })
    await act(() =>
      result.current.login.mutateAsync({
        email: "test@example.com",
        password: "pw",
      }),
    )
    expect(stored.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(true)
    expect(stored.has(OFFLINE_AUTH_KEY)).toBe(true)
    await waitFor(() => expect(result.current.mode).toBe("live"))
  })

  it("waits for an in-flight Supabase write before verifying logout removal", async () => {
    seedLogin()
    let finishWrite!: () => void
    vi.mocked(authStorage.setItem).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = () => {
            stored.set(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify(session))
            resolve()
          }
        }),
    )
    const gatedStorage = withSessionPersistenceGate(authStorage)
    const { result } = renderHook(() => useAuth(), { wrapper: providerWrapper })
    await waitFor(() => expect(result.current.mode).toBe("offline"))

    const lateWrite = gatedStorage.setItem(
      SUPABASE_AUTH_STORAGE_KEY,
      JSON.stringify(session),
    )
    await Promise.resolve()
    let logoutCompleted = false
    const logout = result.current.logout.mutateAsync().then(() => {
      logoutCompleted = true
    })
    await Promise.resolve()
    expect(logoutCompleted).toBe(false)

    finishWrite()
    await lateWrite
    await logout
    expect(stored.has(OFFLINE_AUTH_KEY)).toBe(false)
    expect(stored.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(false)
    expect(logoutCompleted).toBe(true)
  })
})
