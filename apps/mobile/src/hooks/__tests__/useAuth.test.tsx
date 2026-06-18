import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

// Import the real supabase module and the hook under test
import { supabase } from "@nasti/common/supabase"
import { useAuth } from "../useAuth" // adjust this path if necessary
import { ROLE } from "@nasti/common/types"
import {
  AuthError,
  AuthRetryableFetchError,
  type Session,
  type User,
} from "@supabase/supabase-js"

const toBase64Url = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

const createJwt = (payload: Record<string, unknown>) =>
  [
    toBase64Url({ alg: "RS256", kid: "test-key" }),
    toBase64Url(payload),
    "signature",
  ].join(".")

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
  access_token: createJwt({
    app_metadata: {
      org_id: "org-123",
      org_name: "Test Organization",
      role: ROLE.ADMIN,
    },
  }),
  refresh_token: "refresh-123",
  expires_in: 3600,
  token_type: "bearer",
  user: mockUserData,
}

const mockSessionWithoutClaims: Session = {
  ...mockSession,
  access_token: createJwt({ app_metadata: {} }),
}

const mockOrganisation = {
  id: "org-123",
  name: "Test Organization",
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

  it("returns logged-out state when getSession resolves with no session", async () => {
    // ─── Arrange ───────────────────────────────────────────────────────────────
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: new AuthError("Session not found"),
    })

    // ─── Act ─────────────────────────────────────────────────────────────────
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalledOnce()
    })

    await waitFor(() => {
      expect(result.current.session).toBeNull()
      expect(result.current.user).toBeNull()
      expect(result.current.organisation).toBeNull()
      expect(result.current.role).toBeNull()
      expect(result.current.isLoggedIn).toBe(false)
    })
  })

  it("fetches user data when getUser returns a valid user", async () => {
    // ─── Arrange ───────────────────────────────────────────────────────────────
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    // ─── Act ─────────────────────────────────────────────────────────────────
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalledOnce()
      expect(result.current.session).toEqual(mockSession)
      expect(result.current.user).toEqual(mockUserData)
      expect(result.current.organisation).toEqual(mockOrganisation)
      expect(result.current.role).toBe(ROLE.ADMIN)
      expect(result.current.isLoggedIn).toBe(true)
    })
  })

  it("derives organisation and role from JWT app_metadata claims on login", async () => {
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: mockUserData },
      error: null,
    })
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: mockUserData, session: mockSession },
      error: null,
    })
    const fromSpy = vi.spyOn(supabase, "from")

    // ─── Act ─────────────────────────────────────────────────────────────────
    const { result, rerender } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await result.current.login.mutateAsync({
      email: mockUserData.email!,
      password: "pw",
    })

    rerender()

    await waitFor(() => {
      expect(result.current.organisation).toEqual(mockOrganisation)
      expect(result.current.role).toBe(ROLE.ADMIN)
      expect(result.current.isLoggedIn).toBe(true)
    })
    expect(fromSpy).not.toHaveBeenCalledWith("org_user")
  })

  it("leaves organisation and role null when login session has no JWT claims", async () => {
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: mockUserData },
      error: null,
    })
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: mockUserData, session: mockSessionWithoutClaims },
      error: null,
    })

    const { result, rerender } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await result.current.login.mutateAsync({
      email: mockUserData.email!,
      password: "pw",
    })

    rerender()

    await waitFor(() => {
      expect(result.current.organisation).toBeNull()
      expect(result.current.role).toBeNull()
      expect(result.current.isLoggedIn).toBe(true)
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

    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: mockUserData },
      error: null,
    })

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
      expect(result.current.organisation).toEqual(mockOrganisation)
      expect(result.current.role).toBe(ROLE.ADMIN)
      expect(result.current.isLoggedIn).toBe(true)
    })

    // Now mock signOut to succeed:
    vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null })
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    // ─── Act ─────────────────────────────────────────────────────────────────
    await result.current.logout.mutateAsync()

    // ─── Assert ──────────────────────────────────────────────────────────────
    // Because logout.onMutate() clears all queries under ["auth"], we expect the hook to return user=null, organisation=null, isLoggedIn=false
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled()
      expect(result.current.user).toBeNull()
      expect(result.current.organisation).toBeNull()
      expect(result.current.role).toBeNull()
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
