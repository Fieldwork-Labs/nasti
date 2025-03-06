import { TripPeopleForm, useTripPeopleForm } from "../forms/TripPeopleForm"
import { Modal } from "@/components/ui/modal"
import { Trip } from "@/types"

export const TripPeopleModal = ({
  isOpen,
  trip,
  close,
}: {
  isOpen: boolean
  close: () => void
  trip: Trip
}) => {
  const { isSubmitting, handleSubmit, ...tripPeopleFormProps } =
    useTripPeopleForm({ trip, onSave: close })

  return (
    <Modal
      open={isOpen}
      allowSubmit={!isSubmitting}
      onSubmit={handleSubmit}
      onCancel={close}
      title="Edit Trip People"
    >
      <TripPeopleForm {...tripPeopleFormProps} />
    </Modal>
  )
}
