import { useTripSpeciesForm, TripSpeciesForm } from "../forms/TripSpeciesForm"
import { TripWizardStage } from "./lib"
import { useTripFormWizard } from "./useTripFormWizard"

export const TripSpeciesStage = () => {
  const { setCurrentStep, close, trip } = useTripFormWizard()
  const { isSubmitting, onSubmit, ...rest } = useTripSpeciesForm({
    trip,
    close,
  })

  return (
    <TripWizardStage
      title="Select Target Species"
      submitLabel="Save"
      allowSubmit={true}
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
      onCancel={() => setCurrentStep(2)}
    >
      <TripSpeciesForm {...rest} />
    </TripWizardStage>
  )
}
