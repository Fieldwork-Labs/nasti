import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { ReactNode } from "react"

type TripWizardStageProps = {
  title: string
  submitLabel?: string
  cancelLabel?: string
  children?: ReactNode
  allowSubmit?: boolean
  isSubmitting?: boolean
  onSubmit: () => void
  onCancel: () => void
  onSkip?: () => void
}

export const TripWizardStage = ({
  title,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  onSubmit,
  onCancel,
  onSkip,
  allowSubmit,
  isSubmitting,
  children,
}: TripWizardStageProps) => {
  return (
    <AlertDialogContent className="pointer-events-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="pointer-events-auto relative">{children}</div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="sm:justify-between">
        <AlertDialogCancel className="w-full" onClick={onCancel}>
          {cancelLabel}
        </AlertDialogCancel>
        <AlertDialogAction
          className="w-full"
          onClick={onSubmit}
          disabled={!allowSubmit && !isSubmitting}
        >
          {!isSubmitting ? submitLabel : <Spinner />}
        </AlertDialogAction>
      </AlertDialogFooter>
      {onSkip && (
        <button className="text-muted-foreground text-sm" onClick={onSkip}>
          Skip this step
        </button>
      )}
    </AlertDialogContent>
  )
}
