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
        await updateTrip.mutateAsync(tripLocationDetails)
        invalidate()
      }
      close()
    },
    [updateTrip, close, invalidate],
  )

  const { handleSubmit, ...props } = useTripLocationForm({
    trip,
    onSave: handleSave,
  })

  return (
    <Modal
      open={isOpen}
      onSubmit={handleSubmit}
      onCancel={close}
      title="Edit Location"
    >
      <TripLocationForm handleSubmit={handleSubmit} {...props} />
    </Modal>
  )
}
