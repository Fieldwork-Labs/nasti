import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
  status: { permanentRowFailures: 0, permanentMediaFailures: 0, terminalDeleteRetries: 0 },
  logoutMutate: vi.fn(),
  countPendingLocalWork: vi.fn(async () => 0),
}))
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    logout: { isPending: false, mutate: mocks.logoutMutate },
    countUnsyncedWork: mocks.countPendingLocalWork,
  }),
}))
vi.mock("@/hooks/useSyncStatus", () => ({ useSyncStatus: () => ({ status: mocks.status }) }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), useRouter: () => ({ invalidate: vi.fn() }) }))
vi.mock("../SyncIssues", () => ({ SyncIssues: () => null }))
vi.mock("@nasti/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

import { SettingsMenuModal } from "../SettingsMenu"

describe("SettingsMenu", () => {
  afterEach(cleanup)

  beforeEach(() => {
    mocks.status = { permanentRowFailures: 0, permanentMediaFailures: 0, terminalDeleteRetries: 0 }
    mocks.logoutMutate.mockReset()
    mocks.countPendingLocalWork.mockReset().mockResolvedValue(0)
  })

  it("includes visible terminal DELETE retries in the issue badge", () => {
    mocks.status = { ...mocks.status, terminalDeleteRetries: 2 }
    render(<SettingsMenuModal close={vi.fn()} isOpen />)
    expect(screen.getByRole("button", { name: "Sync issues, 2 failures" })).toBeDefined()
    expect(screen.getByText("2")).toBeDefined()
  })

  it("logs out straight away when nothing is waiting to upload", async () => {
    render(<SettingsMenuModal close={vi.fn()} isOpen />)
    fireEvent.click(screen.getByRole("button", { name: "Logout" }))

    await waitFor(() => expect(mocks.logoutMutate).toHaveBeenCalledOnce())
    expect(screen.queryByText("Log out with unsynced data?")).toBeNull()
  })

  it("asks for confirmation before logging out over unsynced data", async () => {
    mocks.countPendingLocalWork.mockResolvedValue(3)
    render(<SettingsMenuModal close={vi.fn()} isOpen />)
    fireEvent.click(screen.getByRole("button", { name: "Logout" }))

    expect(await screen.findByText("Log out with unsynced data?")).toBeDefined()
    expect(screen.getByText(/3 changes on this device haven’t been uploaded yet/)).toBeDefined()
    expect(mocks.logoutMutate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Log out anyway" }))
    expect(mocks.logoutMutate).toHaveBeenCalledOnce()
  })

  it("stays logged in when the confirmation is declined", async () => {
    mocks.countPendingLocalWork.mockResolvedValue(1)
    render(<SettingsMenuModal close={vi.fn()} isOpen />)
    fireEvent.click(screen.getByRole("button", { name: "Logout" }))
    expect(await screen.findByText(/1 change on this device hasn’t been uploaded yet/)).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Stay logged in" }))

    expect(screen.queryByText("Log out with unsynced data?")).toBeNull()
    expect(screen.getByRole("button", { name: "Logout" })).toBeDefined()
    expect(mocks.logoutMutate).not.toHaveBeenCalled()
  })

  it("asks for confirmation when unsynced data can't be counted", async () => {
    mocks.countPendingLocalWork.mockRejectedValue(new Error("database unavailable"))
    render(<SettingsMenuModal close={vi.fn()} isOpen />)
    fireEvent.click(screen.getByRole("button", { name: "Logout" }))

    expect(await screen.findByText("Log out with unsynced data?")).toBeDefined()
    expect(mocks.logoutMutate).not.toHaveBeenCalled()
  })
})
