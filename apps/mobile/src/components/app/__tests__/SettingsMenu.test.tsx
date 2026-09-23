import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const mocks = vi.hoisted(() => ({ status: { permanentRowFailures: 0, permanentMediaFailures: 0, terminalDeleteRetries: 0 } }))
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ logout: { isPending: false, mutate: vi.fn() } }) }))
vi.mock("@/hooks/useSyncStatus", () => ({ useSyncStatus: () => ({ status: mocks.status }) }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), useRouter: () => ({ invalidate: vi.fn() }) }))
vi.mock("../SyncIssues", () => ({ SyncIssues: () => null }))
vi.mock("@nasti/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

import { SettingsMenuModal } from "../SettingsMenu"

describe("SettingsMenu sync issue badge", () => {
  beforeEach(() => { mocks.status = { permanentRowFailures: 0, permanentMediaFailures: 0, terminalDeleteRetries: 0 } })

  it("includes visible terminal DELETE retries in the issue badge", () => {
    mocks.status = { ...mocks.status, terminalDeleteRetries: 2 }
    render(<SettingsMenuModal close={vi.fn()} isOpen />)
    expect(screen.getByRole("button", { name: "Sync issues, 2 failures" })).toBeDefined()
    expect(screen.getByText("2")).toBeDefined()
  })
})
