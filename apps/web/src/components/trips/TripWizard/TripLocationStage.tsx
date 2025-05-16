import { useCallback } from "react"
import {
  TripLocationDetails,
  TripLocationForm,
  useTripLocationForm,
} from "../forms/TripLocationForm"
import { TripWizardStage } from "./lib"
import { useTripFormWizard } from "./useTripFormWizard"

export const TripLocationStage = () => {
  const { setCurrentStep, saveTrip, trip } = useTripFormWizard()
  const handleSave = useCallback(
    async (tripLocationDetails?: TripLocationDetails) => {
      if (tripLocationDetails) {
        await saveTrip(tripLocationDetails)
      }
      setCurrentStep(2)
    },
    [saveTrip, setCurrentStep],
  )

  const { handleSubmit, ...locationProps } = useTripLocationForm({
    trip,
    onSave: handleSave,
  })

  const handleSkip = useCallback(() => {
    setCurrentStep(2)
  }, [setCurrentStep])

  return (
    <TripWizardStage
      title="Select Location"
      submitLabel="Next"
      cancelLabel="Back"
      allowSubmit={true}
      isSubmitting={false}
      onSubmit={handleSubmit}
      onSkip={handleSkip}
      onCancel={() => setCurrentStep(0)}
    >
      <TripLocationForm handleSubmit={handleSubmit} {...locationProps} />
    </TripWizardStage>
  )
}
