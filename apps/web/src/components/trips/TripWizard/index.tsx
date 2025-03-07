import { AlertDialog } from "@nasti/ui/alert-dialog"
import { useTripFormWizard } from "./useTripFormWizard"
import { TripDetailsStage } from "./TripDetailsStage"
import { TripLocationStage } from "./TripLocationStage"
import { TripPeopleStage } from "./TripPeopleStage"
import { TripSpeciesStage } from "./TripSpeciesStage"
export { TripFormProvider } from "./useTripFormWizard"

// Separate component that only depends on currentStep, props used instead of context to prevent re-renders
const WizardContent = ({ currentStep }: { currentStep: number }) => {
  switch (currentStep) {
    case 0:
      return <TripDetailsStage />
    case 1:
      return <TripLocationStage />
    case 2:
      return <TripPeopleStage />
    case 3:
      return <TripSpeciesStage />
    default:
      return null
  }
}

// Modal component that only depends on isOpen
const WizardModal = ({
  isOpen,
  children,
}: {
  isOpen: boolean
  children: React.ReactNode
}) => {
  return <AlertDialog open={isOpen}>{children}</AlertDialog>
}

// Main component that composes the parts
export const TripFormWizard = () => {
  const { isOpen, currentStep } = useTripFormWizard()

  return (
    <WizardModal isOpen={isOpen}>
      <WizardContent currentStep={currentStep} />
    </WizardModal>
  )
}
