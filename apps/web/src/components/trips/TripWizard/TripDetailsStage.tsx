import { useTripFormWizard } from "./useTripFormWizard"
import { TripWizardStage } from "./lib"
import { TripDetailsForm, useTripForm } from "../forms/TripDetailsForm"

export const TripDetailsStage = () => {
  const { setCurrentStep, setTripId, close, trip } = useTripFormWizard()

  const { register, handleSubmit, isValid, isSubmitting, errors } = useTripForm(
    {
      instance: trip,
      onSuccess: (trip) => {
        if (trip) setTripId(trip.id)
        setCurrentStep(1)
      },
    },
  )

  return (
    <TripWizardStage
      title="New Trip"
      submitLabel="Next"
      allowSubmit={isValid}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={close}
    >
      <TripDetailsForm register={register} errors={errors} />
    </TripWizardStage>
  )
}
