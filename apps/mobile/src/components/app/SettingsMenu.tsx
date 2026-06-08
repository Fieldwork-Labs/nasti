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
import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"

export const SettingsMenuModal = ({
  close,
  isOpen,
}: {
  close: () => void
  isOpen: boolean
}) => {
  const { logout } = useAuth()

  const navigate = useNavigate()

  const handleLogout = useCallback(async () => {
    await logout.mutateAsync()
  }, [logout, navigate])

  return (
    <AlertDialog open={isOpen} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Settings</AlertDialogTitle>
          <AlertDialogAction className="w-full" onClick={handleLogout}>
            Logout
          </AlertDialogAction>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="w-full"
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
