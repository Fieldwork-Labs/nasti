import { useAuth } from "@/hooks/useAuth"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
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
  const { status } = useSyncStatus()
  const failureCount = status.permanentRowFailures + status.permanentMediaFailures + status.terminalDeleteRetries
  const { logout } = useAuth({
    onLogout: async () => {
      await router.invalidate()
      await navigate({ to: "/auth/login" })
      close()
    },
  })

  return (
    <>
    <AlertDialog
      open={isOpen}
      onOpenChange={() => {
        if (!logout.isPending) close()
      }}
    >
      <AlertDialogContent>
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
            disabled={logout.isPending}
            onClick={(event) => {
              event.preventDefault()
              logout.mutate()
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
            disabled={logout.isPending}
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
      </AlertDialogContent>
    </AlertDialog>
    <SyncIssues open={syncIssuesOpen} onOpenChange={setSyncIssuesOpen} />
    </>
  )
}
