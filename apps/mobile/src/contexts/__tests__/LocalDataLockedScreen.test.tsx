import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "user-b" }, mode: "live" as "live" | "offline" },
  rpc: vi.fn(),
  countPendingLocalWork: vi.fn(async () => 2),
}))
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ ...mocks.auth, logout: { mutate: vi.fn(), isPending: false } }),
}))
vi.mock("@nasti/common/supabase", () => ({ supabase: { rpc: mocks.rpc } }))
// The real hook, so the test covers the query key it shares with the rest of the app.
vi.mock("@/lib/powersync/localDataOwner", () => ({
  claimUnownedLocalData: vi.fn(),
  countPendingLocalWork: mocks.countPendingLocalWork,
}))

import { LocalDataLockedScreen } from "../LocalDataLockedScreen"

const members = [
  { id: "user-a", name: "Alex Field" },
  { id: "user-b", name: "Bea Bush" },
]

const renderScreen = (ownerId: string | null = "user-a") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LocalDataLockedScreen
        ownerAccess={{ status: "mismatch", ownerId, canClaim: ownerId === null }}
        ownerCheckFailed={false}
        onRetry={vi.fn()}
        onClaimed={vi.fn()}
        onClaimFailed={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe("LocalDataLockedScreen", () => {
  afterEach(cleanup)

  beforeEach(() => {
    mocks.auth = { user: { id: "user-b" }, mode: "live" }
    mocks.rpc.mockReset().mockResolvedValue({ data: members, error: null })
    mocks.countPendingLocalWork.mockReset().mockResolvedValue(2)
  })

  it("names the previous account when they are in the same organisation", async () => {
    renderScreen()

    expect(await screen.findByText(
      "There is still unsynced data from account Alex Field on this device. Please ask them to log in and ensure all data is uploaded.",
    )).toBeDefined()
    expect(mocks.rpc).toHaveBeenCalledWith("get_organisation_users")
  })

  it("falls back to a generic message when the owner isn't a known member", async () => {
    renderScreen("user-elsewhere")

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled())
    expect(await screen.findByText(
      "There is still unsynced data from another account on this device. Please ask them to log in and ensure all data is uploaded.",
    )).toBeDefined()
  })

  it("falls back to a generic message when the member has no name", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: "user-a", name: "  " }], error: null })
    renderScreen()

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled())
    expect(await screen.findByText(/from another account on this device/)).toBeDefined()
  })

  it("falls back to a generic message when the member list can't be loaded", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "offline" } })
    renderScreen()

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled())
    expect(await screen.findByText(/from another account on this device/)).toBeDefined()
  })

  it("doesn't claim there is unsynced data when everything was uploaded", async () => {
    mocks.countPendingLocalWork.mockResolvedValue(0)
    renderScreen()

    expect(await screen.findByText(
      "This device still holds data from account Alex Field, all of it already uploaded. Log out and sign in again to clear it from this device.",
    )).toBeDefined()
  })

  it("keeps the unknown-owner message and claim option for data with no owner", async () => {
    renderScreen(null)

    expect(screen.getByText(/no confirmed account owner/)).toBeDefined()
    expect(screen.getByRole("button", { name: "I’m signed in as the previous owner" })).toBeDefined()
  })
})
