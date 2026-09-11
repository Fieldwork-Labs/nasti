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

type UnsavedChangesDialogProps = {
  open: boolean
  onDiscard?: () => void
  onKeepEditing?: () => void
}

export const UnsavedChangesDialog = ({
  open,
  onDiscard,
  onKeepEditing,
}: UnsavedChangesDialogProps) => (
  <AlertDialog
    open={open}
    onOpenChange={(isOpen) => {
      if (!isOpen) onKeepEditing?.()
    }}
  >
    <AlertDialogContent className="space-y-2">
      <AlertDialogHeader className="text-left">
        <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
        <AlertDialogDescription>
          You have unsaved changes. If you leave now, they will be lost.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex-row justify-end space-x-2">
        <AlertDialogCancel className="mt-0" onClick={() => onKeepEditing?.()}>
          Keep editing
        </AlertDialogCancel>
        <AlertDialogAction onClick={() => onDiscard?.()}>
          Discard
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
