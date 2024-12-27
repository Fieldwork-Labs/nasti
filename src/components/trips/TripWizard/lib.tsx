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
  onSubmit,
  onCancel,
  onSkip,
  allowSubmit,
  isSubmitting,
  children,
}: TripWizardStageProps) => {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>{children}</div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="sm:justify-between">
        <AlertDialogCancel className="w-full" onClick={onCancel}>
          Cancel
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
        <button className="text-sm text-muted-foreground" onClick={onSkip}>
          Skip this step
        </button>
      )}
    </AlertDialogContent>
  )
}
