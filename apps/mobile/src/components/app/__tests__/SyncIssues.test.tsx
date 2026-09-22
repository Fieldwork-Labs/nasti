import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  invalidateQueries: vi.fn(),
  list: vi.fn(),
  retry: vi.fn(),
  dismiss: vi.fn(),
  deleteRetryUnavailableMessage: "This delete cannot be retried automatically because its local row is unavailable. The issue is still saved on this device.",
  status: {
    queuedRows: 0, queuedMedia: 0, waitingForAuthentication: false,
    activelyUploading: false, permanentRowFailures: 0,
    permanentMediaFailures: 0, lastSafeError: null as string | null,
  },
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock("@/hooks/useSyncStatus", () => ({ useSyncStatus: () => ({ status: mocks.status }) }))
vi.mock("@/lib/powersync/syncFailures", () => ({
  DELETE_RETRY_UNAVAILABLE_MESSAGE: mocks.deleteRetryUnavailableMessage,
  listSyncFailures: mocks.list,
  retrySyncFailure: mocks.retry,
  dismissSyncFailure: mocks.dismiss,
}))
vi.mock("@nasti/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div role="dialog">{children}</div> : null,
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

import { SyncIssues } from "../SyncIssues"

const row = {
  failureKind: "row" as const, id: "failure-1", target_table: "trip", entity_id: "entity-1",
  op_type: "PATCH" as const, op_data: '{"name":"private payload"}', error_info: '{"code":"23514"}',
  failed_at: "2026-09-22T00:00:00.000Z", classification: "validation",
}
const media = {
  failureKind: "media" as const, id: "media-1", kind: "photo" as const, status_code: 413,
  safe_message: "Storage rejected the file as too large", failed_at: "2026-09-21T00:00:00.000Z", app_version: "v1",
}

function renderIssues() {
  return render(<SyncIssues open onOpenChange={() => {}} />)
}

describe("SyncIssues", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.status = { queuedRows: 0, queuedMedia: 0, waitingForAuthentication: false, activelyUploading: false, permanentRowFailures: 0, permanentMediaFailures: 0, lastSafeError: null }
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => queryKey[1] === "failures"
      ? { data: [], isLoading: false }
      : { data: mocks.status })
    mocks.retry.mockResolvedValue(undefined)
    mocks.dismiss.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it("shows an empty state", () => {
    renderIssues()
    expect(screen.getByText("No saved sync issues.")).toBeDefined()
  })

  it("shows aggregate pending and paused state without noisy failures", () => {
    mocks.status = { ...mocks.status, queuedRows: 2, waitingForAuthentication: true }
    renderIssues()
    expect(screen.getByText(/Sync is paused until live authentication is available/)).toBeDefined()
    expect(screen.getByText("No saved sync issues.")).toBeDefined()
  })

  it("shows row and media failures without raw payloads", () => {
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => queryKey[1] === "failures"
      ? { data: [row, media], isLoading: false }
      : { data: mocks.status })
    renderIssues()
    expect(screen.getByText("trip change")).toBeDefined()
    expect(screen.getByText("photo upload")).toBeDefined()
    expect(screen.getByText("Server rejected this change (23514).")).toBeDefined()
    expect(screen.queryByText("private payload")).toBeNull()
  })

  it("keeps a failed retry visible and reports the non-destructive result", async () => {
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => queryKey[1] === "failures"
      ? { data: [media], isLoading: false }
      : { data: mocks.status })
    mocks.retry.mockRejectedValue(new Error("local database failure"))
    renderIssues()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.getByText("Retry failed. This issue is still saved.")).toBeDefined())
  })

  it("shows the safe unavailable-row message when DELETE retry cannot be registered", async () => {
    const failedDelete = { ...row, op_type: "DELETE" as const, op_data: "{}" }
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => queryKey[1] === "failures"
      ? { data: [failedDelete], isLoading: false }
      : { data: mocks.status })
    mocks.retry.mockRejectedValue(new Error(mocks.deleteRetryUnavailableMessage))
    renderIssues()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.getByText(mocks.deleteRetryUnavailableMessage)).toBeDefined())
    expect(screen.getByText("Retry failed. This issue is still saved.")).toBeDefined()
  })

  it("retries successfully and requires confirmation before dismissal", async () => {
    mocks.useQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => queryKey[1] === "failures"
      ? { data: [row], isLoading: false }
      : { data: mocks.status })
    renderIssues()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith(row))
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.getByText("This hides the issue notice only. It does not delete the captured record or media from your normal local views.")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Hide issue" }))
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith(row))
  })
})
