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
    (tripLocationDetails?: TripLocationDetails) => {
      if (tripLocationDetails) saveTrip(tripLocationDetails)
      setCurrentStep(2)
    },
    [saveTrip, setCurrentStep],
  )

  const {
    inputValue,
    showSearch,
    error,
    locationName,
    locationCoords,
    viewState,
    results,
    isLoading,
    selectedLocation,
    handleInputChange,
    handleResultClick,
    handleSubmit,
    setUseCustomName,
    setShowSearch,
    setViewState,
  } = useTripLocationForm({ trip, onSave: handleSave })

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
      <TripLocationForm
        inputValue={inputValue}
        showSearch={showSearch}
        selectedLocation={selectedLocation}
        error={error}
        locationName={locationName}
        locationCoords={locationCoords}
        viewState={viewState}
        results={results}
        isLoading={isLoading}
        handleInputChange={handleInputChange}
        handleResultClick={handleResultClick}
        handleSubmit={handleSubmit}
        setUseCustomName={setUseCustomName}
        setShowSearch={setShowSearch}
        setViewState={setViewState}
      />
    </TripWizardStage>
  )
}
