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

export const SettingsMenuModal = ({
  close,
  isOpen,
}: {
  close: () => void
  isOpen: boolean
}) => {
  const { logout } = useAuth()
  console.log({ isOpen })

  return (
    <AlertDialog open={isOpen} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Settings</AlertDialogTitle>
          <AlertDialogAction
            className="w-full"
            onClick={() => {
              logout.mutateAsync()
            }}
          >
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
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
