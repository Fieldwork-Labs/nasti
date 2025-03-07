import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nasti/ui/alert-dialog"
import { useState } from "react"
import { Spinner } from "./spinner"

export type ModalProps = {
  open: boolean
  onOpenChange?: (open: boolean) => void
  onCancel?: () => void
  onSubmit?: () => void
  allowSubmit?: boolean
  title?: string | React.ReactNode
  isPending?: boolean
}

export const Modal = ({
  open,
  onOpenChange,
  onCancel,
  onSubmit,
  allowSubmit = true,
  isPending = false,
  title,
  children,
}: ModalProps & { children: React.ReactNode }) => {
  // memoise the title so that if the data is deleted, the modal
  // doesn't display a flash of undefined data
  const [memoisedTitle] = useState(title)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {memoisedTitle && (
            <AlertDialogTitle>{memoisedTitle}</AlertDialogTitle>
          )}

          {children}
        </AlertDialogHeader>
        {onSubmit && (
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onSubmit} disabled={!allowSubmit}>
              {!isPending && "Submit"}
              {isPending && <Spinner />}
            </AlertDialogAction>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
