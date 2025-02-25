import { Collection } from "@/types"
import { Modal, ModalProps } from "../ui/modal"
import { CollectionForm, useCollectionForm } from "./CollectionForm"

export const AddCollectionModal = ({
  tripId,
  open,
  close,
  onSuccess,
}: ModalProps & {
  close: () => void
  tripId: string
  onSuccess?: (collection: Collection) => void
}) => {
  const { onSubmit, isPending, form } = useCollectionForm({
    tripId,
    onSuccess: (collection) => {
      if (onSuccess) onSuccess(collection)
      close()
    },
  })
  return (
    <Modal
      title="New collection"
      open={open}
      onSubmit={onSubmit}
      onCancel={close}
      isPending={isPending}
      allowSubmit={!isPending && form.formState.isValid}
    >
      {/* unmount the form on modal close, resets the form values */}
      {open && <CollectionForm {...{ form }} />}
    </Modal>
  )
}
export const UpdateCollectionModal = ({
  instance,
  open,
  close,
  onSuccess,
}: ModalProps & {
  close: () => void
  instance: Collection
  onSuccess?: (collection: Collection) => void
}) => {
  const { onSubmit, isPending, form } = useCollectionForm({
    instance,
    onSuccess: (collection) => {
      if (onSuccess) onSuccess(collection)
      close()
    },
  })
  return (
    <Modal
      title="Update collection"
      open={open}
      onSubmit={onSubmit}
      onCancel={close}
      isPending={isPending}
      allowSubmit={!isPending && form.formState.isValid}
    >
      {/* unmount the form on modal close, resets the form values */}
      {open && <CollectionForm {...{ form }} />}
    </Modal>
  )
}
