import { TripSpeciesForm, useTripSpeciesForm } from "../forms/TripSpeciesForm"
import { Modal } from "@nasti/ui/modal"
import { Trip } from "@nasti/common/types"

export const TripSpeciesModal = ({
  isOpen,
  trip,
  close,
}: {
  isOpen: boolean
  close: () => void
  trip: Trip
}) => {
  const { onSubmit, isLoading, isSubmitting, ...tripSpeciesFormProps } =
    useTripSpeciesForm({ trip, close })

  return (
    <Modal
      open={isOpen}
      allowSubmit={!isLoading && !isSubmitting}
      onSubmit={onSubmit}
      onCancel={close}
      title="Edit Trip Species"
    >
      <TripSpeciesForm {...tripSpeciesFormProps} isLoading={isLoading} />
    </Modal>
  )
}
