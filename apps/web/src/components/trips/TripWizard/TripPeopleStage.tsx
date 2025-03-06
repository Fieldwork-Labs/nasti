import { useTripFormWizard } from "./useTripFormWizard"
import { TripWizardStage } from "./lib"
import { TripPeopleForm, useTripPeopleForm } from "../forms/TripPeopleForm"

export const TripPeopleStage = () => {
  const { setCurrentStep, trip } = useTripFormWizard()
  const {
    isSubmitting,
    handleSubmit,
    options,
    onPeopleChange,
    defaultValue,
    error,
  } = useTripPeopleForm({ trip, onSave: () => setCurrentStep(3) })

  return (
    <TripWizardStage
      title="Select People"
      submitLabel="Next"
      cancelLabel="Back"
      allowSubmit={true}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={() => setCurrentStep(1)}
      onSkip={() => setCurrentStep(3)}
    >
      <TripPeopleForm
        options={options}
        onPeopleChange={onPeopleChange}
        defaultValue={defaultValue}
        error={error}
      />
    </TripWizardStage>
  )
}
