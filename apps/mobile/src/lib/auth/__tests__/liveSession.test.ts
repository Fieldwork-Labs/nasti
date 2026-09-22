import { beforeEach, describe, expect, it, vi } from "vitest"

const { getSessionMock, getUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
}))

vi.mock("@nasti/common/supabase", () => ({
  supabase: { auth: { getSession: getSessionMock, getUser: getUserMock } },
}))

import { liveUploadCredentials } from "../liveSession"

describe("live upload credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("acquires the live session token", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
      error: null,
    })

    await expect(liveUploadCredentials.acquire()).resolves.toEqual({
      accessToken: "test-token",
    })
    expect(getSessionMock).toHaveBeenCalledOnce()
  })

  it("returns null when the session is missing or auth reports an error", async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null }, error: null })
    getSessionMock.mockResolvedValueOnce({
      data: { session: { access_token: "ignored" } },
      error: new Error("auth unavailable"),
    })

    await expect(liveUploadCredentials.acquire()).resolves.toBeNull()
    await expect(liveUploadCredentials.acquire()).resolves.toBeNull()
  })

  it("returns null on timeout and consumes a late rejection", async () => {
    let rejectSession!: (error: Error) => void
    getSessionMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSession = reject
      }),
    )

    await expect(liveUploadCredentials.acquire(0)).resolves.toBeNull()
    rejectSession(new Error("late failure"))
    await Promise.resolve()
  })

  it("confirms the supplied token with the auth server", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null })

    await expect(
      liveUploadCredentials.confirm({ accessToken: "test-token" }),
    ).resolves.toBe(true)
    expect(getUserMock).toHaveBeenCalledWith("test-token")
  })

  it("rejects invalid tokens and confirmation timeouts", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: new Error("no") })
    getUserMock.mockReturnValueOnce(new Promise(() => undefined))

    await expect(
      liveUploadCredentials.confirm({ accessToken: "bad-token" }),
    ).resolves.toBe(false)
    await expect(
      liveUploadCredentials.confirm({ accessToken: "slow-token" }, 0),
    ).resolves.toBe(false)
  })
})
