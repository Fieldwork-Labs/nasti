import { AlertDialog } from "@/components/ui/alert-dialog"
import { useTripFormWizard } from "./useTripFormWizard"
import { TripDetailsForm } from "./TripDetailsForm"
import { TripLocationForm } from "./TripLocationForm"
import { TripPeopleForm } from "./TripPeopleForm"
import { TripSpeciesForm } from "./TripSpeciesForm"
export { TripFormProvider } from "./useTripFormWizard"

export const TripFormWizard = () => {
  const { currentStep, isOpen } = useTripFormWizard()
  const Component = () => {
    switch (currentStep) {
      case 0:
        return <TripDetailsForm />
      case 1:
        return <TripLocationForm />
      case 2:
        return <TripPeopleForm />
      case 3:
        return <TripSpeciesForm />
    }
  }

  return (
    <AlertDialog open={isOpen}>
      <Component />
    </AlertDialog>
  )
}
