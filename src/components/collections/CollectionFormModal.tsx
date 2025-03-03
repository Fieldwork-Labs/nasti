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
import React, { useCallback, useMemo, useState } from "react"
import { CollectionPhotoUpload } from "../collectionPhotos/CollectionPhotoUpload"
import { Spinner } from "../ui/spinner"
import { CollectionForm } from "./CollectionForm"
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
        <AlertDialogCancel
          className="w-full"
          onClick={(e) => {
            e.preventDefault()
            setStage("form")
          }}
        >
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
  const { close, form, onSubmit, isPending, tripId } =
    useCollectionFormContext()

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>New collection</AlertDialogTitle>

        <CollectionForm {...{ form }} tripId={tripId} />
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

  const handleClose = useCallback(() => {
    setStage("form")
    close()
  }, [close])

  if (!open) return null
  // only mount the component if open, to ensure form is reset
  if (open)
    return (
      <CollectionFormProvider
        stage={stage}
        setStage={setStage}
        tripId={tripId}
        close={close}
      >
        <AlertDialog
          open={open}
          onOpenChange={(isOpen) => (isOpen ? undefined : handleClose())}
        >
          {/* unmount the form on modal close, resets the form values */}
          {open && (
            <>
              {stage === "form" && <AddCollectionFormModal />}
              {stage === "photos" && <CollectionFormPhotosModal />}
            </>
          )}
        </AlertDialog>
      </CollectionFormProvider>
    )
}

export const UpdateCollectionWizardModal = ({
  instance,
  open,
  close,
}: ModalProps & {
  close: () => void
  instance: Collection
}) => {
  const [stage, setStage] = useState<"form" | "photos">("form")

  return (
    <CollectionFormProvider
      stage={stage}
      setStage={setStage}
      instance={instance}
      close={close}
    >
      <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
        {/* unmount the form on modal close, resets the form values */}
        {open && stage === "form" && <UpdateCollectionFormModal />}
        {open && stage === "photos" && <CollectionFormPhotosModal />}
      </AlertDialog>
    </CollectionFormProvider>
  )
}

export const UpdateCollectionFormModal = () => {
  const { close, form, onSubmit, isPending, setStage, tripId } =
    useCollectionFormContext()

  const handleGoToPhotos = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()

      if (!form.formState.isDirty) return setStage("photos")
      else {
        await onSubmit()
        setStage("photos")
      }
    },
    [form.formState.isDirty, setStage, onSubmit],
  )

  const goToPhotosText = useMemo(() => {
    if (!form.formState.isDirty) return "Update Photos"
    else return "Save and Update Photos"
  }, [form.formState.isDirty])

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Update collection</AlertDialogTitle>
        <CollectionForm {...{ form }} tripId={tripId} />
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="w-full" onClick={close}>
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={handleGoToPhotos}
          className="w-full"
          disabled={isPending || !form.formState.isValid}
        >
          {!isPending && <span>{goToPhotosText}</span>}
          {isPending && <Spinner />}
        </AlertDialogAction>
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
  )
}
