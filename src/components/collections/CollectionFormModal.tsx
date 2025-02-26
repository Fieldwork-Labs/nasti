import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Collection } from "@/types"
import { useState } from "react"
import { CollectionPhotoUpload } from "../collectionPhotos/CollectionPhotoUpload"
import { Spinner } from "../ui/spinner"
import { CollectionForm, useCollectionForm } from "./CollectionForm"
import {
  CollectionFormProvider,
  useCollectionFormContext,
} from "./CollectionFormContext"

export type ModalProps = {
  open: boolean
  onCancel?: () => void
  onSubmit?: () => void
  submitText?: string
  allowSubmit?: boolean
  title?: string
  isPending?: boolean
}

export const CollectionFormPhotosModal = () => {
  const { collection, close, setStage } = useCollectionFormContext()

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Upload photos</AlertDialogTitle>

        {collection && <CollectionPhotoUpload collectionId={collection.id} />}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="w-full" onClick={() => setStage("form")}>
          Back
        </AlertDialogCancel>
        <AlertDialogAction className="w-full" onClick={close}>
          OK
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

export const AddCollectionFormModal = () => {
  const { close, form, onSubmit, isPending } = useCollectionFormContext()

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>New collection</AlertDialogTitle>

        <CollectionForm {...{ form }} />
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="w-full" onClick={close}>
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          className="w-full"
          disabled={isPending || !form.formState.isValid}
          onClick={onSubmit}
        >
          {!isPending && "Save and Add Photos"}
          {isPending && <Spinner />}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

export const AddCollectionWizardModal = ({
  tripId,
  open,
  close,
}: ModalProps & {
  close: () => void
  tripId: string
}) => {
  const [stage, setStage] = useState<"form" | "photos">("form")

  return (
    <CollectionFormProvider
      stage={stage}
      setStage={setStage}
      tripId={tripId}
      close={close}
    >
      <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
        {/* unmount the form on modal close, resets the form values */}
        {open && stage === "form" && <AddCollectionFormModal />}
        {open && stage === "photos" && <CollectionFormPhotosModal />}
      </AlertDialog>
    </CollectionFormProvider>
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
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update collection</AlertDialogTitle>

          {/* unmount the form on modal close, resets the form values */}
          {open && <CollectionForm {...{ form }} />}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="w-full" onClick={close}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onSubmit}
            className="w-full"
            disabled={
              isPending || !form.formState.isValid || !form.formState.isDirty
            }
          >
            {!isPending && "Save"}
            {isPending && <Spinner />}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
