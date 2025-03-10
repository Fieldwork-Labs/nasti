import { Modal } from "@nasti/ui/modal"
import { Trip } from "@nasti/common/types"
import { useCallback } from "react"
import {
  TripLocationDetails,
  TripLocationForm,
  useTripLocationForm,
} from "../forms/TripLocationForm"
import { useUpdateTrip } from "../forms/useUpdateTrip"
import { useTripDetail } from "@/hooks/useTripDetail"

export const TripLocationModal = ({
  isOpen,
  trip,
  close,
}: {
  isOpen: boolean
  close: () => void
  trip: Trip
}) => {
  const updateTrip = useUpdateTrip(trip)
  const { invalidate } = useTripDetail(trip?.id)
  const handleSave = useCallback(
    async (tripLocationDetails?: TripLocationDetails) => {
      if (tripLocationDetails) {
        await updateTrip(tripLocationDetails)
        invalidate()
      }
      close()
    },
    [updateTrip, close, invalidate],
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

  return (
    <Modal
      open={isOpen}
      onSubmit={handleSubmit}
      onCancel={close}
      title="Edit Location"
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
    </Modal>
  )
}
