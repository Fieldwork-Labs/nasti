import { AlertDialog } from "@/components/ui/alert-dialog"
import { useTripFormWizard } from "@/contexts/trip-form"
import { AlertDialogProps } from "@radix-ui/react-alert-dialog"
import { TripDetailsForm } from "./TripDetailsForm"
import { TripLocationForm } from "./TripLocationForm"

export const TripFormWizard = ({ open }: AlertDialogProps) => {
  const { currentStep } = useTripFormWizard()
  const Component = () => {
    switch (currentStep) {
      case 0:
        return <TripDetailsForm />
      case 1:
        return <TripLocationForm />
    }
  }

  return (
    <AlertDialog open={open}>
      <Component />
    </AlertDialog>
  )
}
