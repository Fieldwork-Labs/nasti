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

export const SettingsMenuModal = ({
  close,
  isOpen,
}: {
  close: () => void
  isOpen: boolean
}) => {
  const navigate = useNavigate()
  const router = useRouter()
  const { logout } = useAuth({
    onLogout: async () => {
      await router.invalidate()
      await navigate({ to: "/auth/login" })
      close()
    },
  })

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={() => {
        if (!logout.isPending) close()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Settings</AlertDialogTitle>
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
  )
}
