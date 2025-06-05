import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

// Import the real supabase module and the hook under test
import { supabase } from "@nasti/common/supabase"
import { useAuth } from "../useAuth" // adjust this path if necessary
import {
  AuthError,
  AuthRetryableFetchError,
  Session,
  User,
} from "@supabase/supabase-js"

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const mockUserData: User = {
  id: "user-123",
  email: "test@example.com",
  created_at: "2023-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
}

const mockSession: Session = {
  access_token: "token-123",
  refresh_token: "refresh-123",
  expires_in: 3600,
  token_type: "bearer",
  user: mockUserData,
}

const mockOrgData = {
  id: "org-user-123",
  user_id: "user-123",
  organisation: {
    id: "org-123",
    name: "Test Organization",
  },
}

// ─── Test‐wrapper for React Query ───────────────────────────────────────────────
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// ─── Test Suite ────────────────────────────────────────────────────────────────
describe("useAuth hook", () => {
  beforeEach(() => {
    // Clear any previous spies/mocks on supabase
    vi.restoreAllMocks()
  })

  it("returns user = null and isLoggedIn = false if getUser resolves with no user", async () => {
    // ─── Arrange ───────────────────────────────────────────────────────────────
    // Spy on supabase.auth.getUser() so that it resolves to { data: { user: null } }:
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: null },
      error: new AuthError("User not found"),
    })

    // No need to mock supabase.from(...) here, because the "org" query is disabled
    // when user === null (enabled: Boolean(user) in the hook).

    // ─── Act ─────────────────────────────────────────────────────────────────
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    // ─── Assert ──────────────────────────────────────────────────────────────
    // First wait for the getUser call to fire and the query to resolve:
    await waitFor(() => {
      expect(supabase.auth.getUser).toHaveBeenCalledOnce()
    })

    // Now assert that `result.current.user` is explicitly null (not undefined),
    // and that `org` is null, and isLoggedIn === false.
    await waitFor(() => {
      expect(result.current.user).toBeNull()
      expect(result.current.org).toBeUndefined()
      expect(result.current.isLoggedIn).toBe(false)
    })
  })

  it("fetches user data when getUser returns a valid user", async () => {
    // ─── Arrange ───────────────────────────────────────────────────────────────
    // 1) Spy on getUser → returns the mockUserData
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: mockUserData },
      error: null,
    })

    // ─── Act ─────────────────────────────────────────────────────────────────
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    // 1) Wait until getUser has been called and `user` is set to mockUserData
    await waitFor(() => {
      expect(supabase.auth.getUser).toHaveBeenCalledOnce()
      expect(result.current.user).toEqual(mockUserData)
    })
  })

  it("fetches org data when supabase select org_user returns a valid org_user", async () => {
    // ─── Arrange ───────────────────────────────────────────────────────────────
    // 1) Spy on getUser → returns the mockUserData
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: mockUserData },
      error: null,
    })

    // 2) Spy on the `.from("org_user")` chain so that `.single()` resolves with our org data.
    //    We overwrite `supabase.from` to return an object whose `.select()` → `{ eq() → { single() }}`.
    // each of these mocks need to be created separately because they are used in different places
    // ─── Adjusted mock setup ────────────────────────────────────────────

    const singleMock = vi.fn(() =>
      Promise.resolve({ data: mockOrgData, error: null }),
    )
    const eqMock = vi.fn(() => ({ single: singleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    const fakeFrom = { select: selectMock }
    vi.spyOn(supabase, "from").mockReturnValue(fakeFrom as any)

    // ─── Act ─────────────────────────────────────────────────────────────────
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("org_user")
      expect(selectMock).toHaveBeenCalledWith("*, organisation(id, name)")
      expect(eqMock).toHaveBeenCalled()
      expect(eqMock.mock.calls[0]).toEqual(["user_id", mockUserData.id])
      expect(result.current.org).toEqual(mockOrgData)
    })
  })

  it("login.mutateAsync throws a retryable‐error message if signInWithPassword yields that kind of error", async () => {
    const fakeError = new AuthRetryableFetchError("Fetch failed", 502)

    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: null, session: null },
      error: fakeError,
    })

    // We do not need getUser or org mocks here, because we’re directly testing login.mutateAsync.

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    // ─── Act ─────────────────────────────────────────────────────────────────
    let caughtError: Error | null = null
    try {
      await result.current.login.mutateAsync({
        email: "x@x.com",
        password: "pw",
      })
    } catch (err) {
      caughtError = err as unknown as Error
    }
    // ─── Assert ──────────────────────────────────────────────────────────────
    expect(caughtError).not.toBeNull()
    expect((caughtError as unknown as Error).message).toContain(
      "Unable to connect to server",
    )
  })

  it("clears auth state on logout (user/org become null, isLoggedIn false)", async () => {
    // ─── Arrange ───────────────────────────────────────────────────────────────
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: mockUserData, session: mockSession },
      error: null,
    })

    const singleMock = vi.fn(() =>
      Promise.resolve({ data: mockOrgData, error: null }),
    )
    const eqMock = vi.fn(() => ({ single: singleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    const fakeFrom = { select: selectMock }
    vi.spyOn(supabase, "from").mockReturnValue(fakeFrom as any)
    const { result, rerender } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })
    await result.current.login.mutateAsync({
      email: mockUserData.email!,
      password: "pw",
    })

    rerender()

    // Wait until the hook picks up both user and org:
    await waitFor(() => {
      expect(result.current.user).toEqual(mockUserData)
      expect(result.current.org).toEqual(mockOrgData)
      expect(result.current.isLoggedIn).toBe(true)
    })

    // Now mock signOut to succeed:
    vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null })
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    // ─── Act ─────────────────────────────────────────────────────────────────
    await result.current.logout.mutateAsync()

    // ─── Assert ──────────────────────────────────────────────────────────────
    // Because logout.onMutate() clears all queries under ["auth"], we expect the hook to return user=null, org=null, isLoggedIn=false
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled()
      expect(result.current.user).toBeNull()
      expect(result.current.org).toBeNull()
      expect(result.current.isLoggedIn).toBe(false)
    })
  })

  describe("getSession", () => {
    it("should return session from supabase", async () => {
      vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      const { data } = await result.current.getSession()
      expect(data.session).toEqual(mockSession)
      expect(supabase.auth.getSession).toHaveBeenCalled()
    })
  })
})
