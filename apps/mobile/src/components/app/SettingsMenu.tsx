import { useAuth } from "@/hooks/useAuth"
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
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { SyncIssues } from "./SyncIssues"
import { useSyncStatus } from "@/hooks/useSyncStatus"

export const SettingsMenuModal = ({
  close,
  isOpen,
}: {
  close: () => void
  isOpen: boolean
}) => {
  const navigate = useNavigate()
  const router = useRouter()
  const [syncIssuesOpen, setSyncIssuesOpen] = useState(false)
  // Set while asking to confirm logging out over unsynced data.
  const [unsyncedCount, setUnsyncedCount] = useState<number | null>(null)
  const [isCheckingUnsynced, setIsCheckingUnsynced] = useState(false)
  const { status } = useSyncStatus()
  const failureCount = status.permanentRowFailures + status.permanentMediaFailures + status.terminalDeleteRetries
  const { logout, countUnsyncedWork } = useAuth({
    onLogout: async () => {
      await router.invalidate()
      await navigate({ to: "/auth/login" })
      setUnsyncedCount(null)
      close()
    },
  })

  const requestLogout = async () => {
    setIsCheckingUnsynced(true)
    let pending = 0
    try {
      pending = await countUnsyncedWork()
    } catch {
      // Can't tell: ask rather than risk a silent lock-out of the next person.
      pending = 1
    } finally {
      setIsCheckingUnsynced(false)
    }
    if (pending > 0) setUnsyncedCount(pending)
    else logout.mutate()
  }

  const isBusy = logout.isPending || isCheckingUnsynced

  return (
    <>
    <AlertDialog
      open={isOpen}
      onOpenChange={() => {
        if (isBusy) return
        setUnsyncedCount(null)
        close()
      }}
    >
      <AlertDialogContent>
        {unsyncedCount !== null ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out with unsynced data?</AlertDialogTitle>
              <AlertDialogDescription>
                {unsyncedCount === 1
                  ? "1 change on this device hasn’t been uploaded yet."
                  : `${unsyncedCount} changes on this device haven’t been uploaded yet.`}{" "}
                If you log out now, they stay on this device and nobody else
                can use the app on it until you log back in and they finish
                uploading.
              </AlertDialogDescription>
              {logout.error && (
                <p role="alert" className="text-destructive text-sm">
                  {logout.error.message}
                </p>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="w-full"
                disabled={logout.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  setUnsyncedCount(null)
                }}
              >
                Stay logged in
              </AlertDialogCancel>
              <AlertDialogAction
                className="w-full bg-destructive hover:bg-destructive/90"
                disabled={logout.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  logout.mutate()
                }}
              >
                {logout.isPending ? "Logging out…" : "Log out anyway"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Settings</AlertDialogTitle>
              <button
                type="button"
                className="w-full rounded-md border px-4 py-2 text-left"
                aria-label={status.requiresSignIn ? "Sign in again to sync" : failureCount ? `Sync issues, ${failureCount} failures` : "Sync issues"}
                onClick={() => setSyncIssuesOpen(true)}
              >
                <span>{status.requiresSignIn ? "Sign in again to sync" : "Sync issues"}</span>
                {failureCount > 0 && <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs text-white">{failureCount}</span>}
              </button>
              <AlertDialogAction
                className="w-full"
                disabled={isBusy}
                onClick={(event) => {
                  event.preventDefault()
                  void requestLogout()
                }}
              >
                {logout.isPending ? "Logging out…" : "Logout"}
              </AlertDialogAction>
              {logout.error && (
                <p role="alert" className="text-destructive text-sm">
                  {logout.error.message}
                </p>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="w-full"
                disabled={isBusy}
                onClick={(e) => {
                  e.preventDefault()
                  close()
                }}
              >
                Close
              </AlertDialogCancel>
              <div className="flex items-center justify-between border-t pb-2 pt-4">
                <span className="text-muted-foreground">Seed Scout Version</span>
                <span className="text-muted-foreground font-mono">
                  {__BUILD_ID__}
                </span>
              </div>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
    <SyncIssues open={syncIssuesOpen} onOpenChange={setSyncIssuesOpen} />
    </>
  )
}
