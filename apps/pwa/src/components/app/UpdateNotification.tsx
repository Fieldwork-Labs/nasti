import { useSwStatus } from "@/contexts/swStatus"
import { useNetwork } from "@/hooks/useNetwork"

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

export function UpdateNotification() {
  const {
    updateAvailable,
    ignoreUpdate,
    setIgnoreUpdate,
    updateServiceWorker,
    isUpdating,
  } = useSwStatus()
  const { isOnline } = useNetwork()

  return (
    <AlertDialog open={updateAvailable && !ignoreUpdate && isOnline}>
      <AlertDialogContent className="space-y-2">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>New Version Available!</AlertDialogTitle>
          <AlertDialogDescription>
            Choose to update, or ignore this update for now
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-end space-x-2">
          <AlertDialogCancel
            className="mt-0"
            onClick={(e) => {
              e.preventDefault()
              setIgnoreUpdate(true)
            }}
          >
            Ignore
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={updateServiceWorker}
            disabled={isUpdating}
          >
            {!isUpdating && "Update"}
            {isUpdating && "Updating..."}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
