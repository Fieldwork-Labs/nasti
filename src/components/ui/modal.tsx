import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useState } from "react"

export const Modal = ({
  open,
  onOpenChange,
  onCancel,
  onSubmit,
  title,
  description,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onSubmit: () => void
  title: string
  description: string
}) => {
  // memoise the title and description so that if the data is deleted, the modal
  // doesn't display a flash of undefined data
  const [memoisedTitle] = useState(title)
  const [memoisedDescription] = useState(description)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{memoisedTitle}</AlertDialogTitle>
          <AlertDialogDescription>{memoisedDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onSubmit}>Submit</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
