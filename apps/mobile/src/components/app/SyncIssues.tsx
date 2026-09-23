import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nasti/ui/alert-dialog"
import { dismissSyncFailure, listSyncFailures, retrySyncFailure, type SyncFailure } from "@/lib/powersync/syncFailures"
import { useSyncStatus } from "@/hooks/useSyncStatus"

export function SyncIssues({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const { status } = useSyncStatus()
  const [pendingDismiss, setPendingDismiss] = useState<SyncFailure | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const failures = useQuery({
    queryKey: ["sync", "failures"],
    queryFn: () => listSyncFailures(),
    enabled: open,
    networkMode: "always",
    refetchInterval: 5_000,
  })
  const retry = async (failure: SyncFailure): Promise<boolean> => {
    setActionError(null)
    try {
      await retrySyncFailure(failure)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sync", "failures"] }),
        queryClient.invalidateQueries({ queryKey: ["sync", "status-summary"] }),
      ])
      return true
    } catch (error) {
      setActionError("Retry could not be queued. The issue is still saved on this device.")
      return false
    }
  }
  const dismiss = async () => {
    if (!pendingDismiss) return
    setActionError(null)
    try {
      await dismissSyncFailure(pendingDismiss)
      setPendingDismiss(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sync", "failures"] }),
        queryClient.invalidateQueries({ queryKey: ["sync", "status-summary"] }),
      ])
    } catch {
      setActionError("The issue could not be hidden. It remains saved on this device.")
      setPendingDismiss(null)
    }
  }

  return <>
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Sync issues</AlertDialogTitle>
          <AlertDialogDescription>
            {status.requiresSignIn
              ? "Sign in again to sync. Your saved local work is still on this device."
              : status.terminalDeleteRetries > 0
              ? `${status.terminalDeleteRetries} delete ${status.terminalDeleteRetries === 1 ? "retry needs" : "retries need"} attention.`
              : status.waitingForAuthentication
              ? "Sync is paused until live authentication is available. Your local work is safe."
              : status.queuedRows + status.queuedMedia + status.queuedDeleteRetries > 0
                ? `${status.queuedRows + status.queuedMedia + status.queuedDeleteRetries} item${status.queuedRows + status.queuedMedia + status.queuedDeleteRetries === 1 ? " is" : "s are"} waiting to sync.`
                : "Your local changes are up to date."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failures.isLoading ? <p>Loading saved issues…</p> : failures.data?.length ? (
          <ul className="max-h-[50vh] space-y-3 overflow-y-auto">
            {failures.data.map((failure) => <FailureRow key={`${failure.failureKind}:${failure.id}`} failure={failure} onRetry={() => retry(failure)} onDismiss={() => setPendingDismiss(failure)} />)}
          </ul>
        ) : <p>No saved sync issues.</p>}
        {actionError && <p role="alert" className="text-destructive text-sm">{actionError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={pendingDismiss !== null} onOpenChange={(value) => { if (!value) setPendingDismiss(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Hide this sync issue?</AlertDialogTitle>
          <AlertDialogDescription>
            This hides the issue notice only. It does not remove preserved local data. Any queued delete retry continues until the server confirms it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep issue</AlertDialogCancel>
          <AlertDialogAction onClick={(event) => { event.preventDefault(); void dismiss() }}>Hide issue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}

function FailureRow({ failure, onRetry, onDismiss }: { failure: SyncFailure; onRetry: () => Promise<boolean>; onDismiss: () => void }) {
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(false)
  const retry = async () => {
    setRetrying(true)
    setRetryError(false)
    try { setRetryError(!(await onRetry())) } finally { setRetrying(false) }
  }
  const label = failure.failureKind === "media"
    ? `${failure.kind} upload`
    : `${failure.target_table.replace(/_/g, " ")} ${failure.op_type === "DELETE" ? "delete" : "change"}`
  const message = failure.failureKind === "media"
    ? failure.safe_message
    : failure.op_type === "DELETE" && failure.delete_retry_message
      ? failure.delete_retry_message
      : rowMessage(failure)
  const deleteQueued = failure.failureKind === "row" && failure.op_type === "DELETE" && (failure.delete_retry_status === "pending" || failure.delete_retry_status === "sending")
  const deleteTerminal = failure.failureKind === "row" && failure.op_type === "DELETE" && failure.delete_retry_status === "failed"
  return <li className="rounded-md border p-3 text-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">{deleteQueued ? "Delete retry queued. This issue will stay visible until the server confirms it." : deleteTerminal ? `Delete retry needs attention. ${message}` : message}</p>
        <time className="text-muted-foreground" dateTime={failure.failed_at}>{new Date(failure.failed_at).toLocaleString()}</time>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" disabled={retrying || deleteQueued} onClick={() => void retry()}>{deleteQueued ? "Retry queued" : retrying ? "Retrying…" : "Retry"}</button>
        <button type="button" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
    {retryError && <p role="alert" className="text-destructive">Retry failed. This issue is still saved.</p>}
  </li>
}

function rowMessage(failure: Extract<SyncFailure, { failureKind: "row" }>): string {
  try {
    const code = (JSON.parse(failure.error_info ?? "{}") as { code?: unknown }).code
    return typeof code === "string" ? `Server rejected this change (${code}).` : "This change needs attention."
  } catch {
    return "This change needs attention."
  }
}
