import { TripDetailsForm, useTripForm } from "../forms/TripDetailsForm"
import { Modal } from "@nasti/ui/modal"
import { Trip } from "@/types"
import { useTripDetail } from "@/hooks/useTripDetail"

export const TripDetailsModal = ({
  isOpen,
  trip,
  close,
}: {
  isOpen: boolean
  close: () => void
  trip: Trip
}) => {
  const { invalidate } = useTripDetail(trip?.id)

  const { register, handleSubmit, isValid, errors } = useTripForm({
    instance: trip,
    onSuccess: () => {
      invalidate()
      close()
    },
  })

  return (
    <Modal
      open={isOpen}
      allowSubmit={isValid}
      onSubmit={handleSubmit}
      onCancel={close}
      title="Edit Trip"
    >
      <TripDetailsForm register={register} errors={errors} />
    </Modal>
  )
}
