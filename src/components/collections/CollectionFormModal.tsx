import { Collection } from "@/types"
import { Modal, ModalProps } from "../ui/modal"
import { CollectionForm, useCollectionForm } from "./CollectionForm"

export const AddCollectionModal = ({
  tripId,
  open,
  close,
  onCreate,
}: ModalProps & {
  close: () => void
  tripId: string
  onCreate?: (collection: Collection) => void
}) => {
  const { onSubmit, ...formProps } = useCollectionForm({
    tripId,
    onCreate: (collection) => {
      if (onCreate) onCreate(collection)
      close()
    },
  })
  return (
    <Modal
      title="New collection"
      open={open}
      onSubmit={onSubmit}
      onCancel={close}
      allowSubmit={!formProps.isPending && formProps.form.formState.isValid}
    >
      {/* unmount the form on modal close, resets the form values */}
      {open && <CollectionForm {...formProps} />}
    </Modal>
  )
}
