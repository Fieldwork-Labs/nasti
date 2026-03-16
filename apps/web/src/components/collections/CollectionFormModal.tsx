import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nasti/ui/alert-dialog"
import { Collection } from "@nasti/common/types"
import React, { useCallback, useMemo, useState } from "react"
import { CollectionPhotoUpload } from "../collectionPhotos/CollectionPhotoUpload"
import { Spinner } from "@nasti/ui/spinner"
import { CollectionForm, CollectionLocationSelector } from "./CollectionForm"
import {
  CollectionFormProvider,
  useCollectionFormContext,
} from "./CollectionFormContext"
import { useParams } from "@tanstack/react-router"

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
  const {
    close,
    form,
    onSubmit,
    isPending,
    tripId,
    showLocationMap,
    setShowLocationMap,
  } = useCollectionFormContext()

  const handleSelectLocation = useCallback(
    ({ lat, lng }: { lat: number; lng: number }) => {
      const latValue = parseFloat(lat.toPrecision(8))
      const lngValue = parseFloat(lng.toPrecision(9))
      form.setValue("latitude", latValue, { shouldValidate: true })
      form.setValue("longitude", lngValue, { shouldValidate: true })
    },
    [form],
  )

  const initialLocation = useMemo(() => {
    if (!form.watch("latitude") || !form.watch("longitude")) return undefined
    return {
      lat: form.watch("latitude"),
      lng: form.watch("longitude"),
    }
  }, [form])

  if (!tripId) return null

  if (showLocationMap)
    return (
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Select Collection Location</AlertDialogTitle>
          <CollectionLocationSelector
            tripId={tripId}
            initialLocation={initialLocation}
            onLocationSelected={handleSelectLocation}
            onClose={() => setShowLocationMap(false)}
          />
        </AlertDialogHeader>
      </AlertDialogContent>
    )

  return (
    <AlertDialogContent className="h-screen overflow-y-scroll">
      <AlertDialogHeader>
        <AlertDialogTitle>New collection</AlertDialogTitle>

        <CollectionForm
          {...{ form }}
          tripId={tripId}
          setShowLocationMap={setShowLocationMap}
        />
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

  const { id: tripId } = useParams({ from: "/_private/trips/$id/" })
  return (
    <CollectionFormProvider
      stage={stage}
      setStage={setStage}
      instance={instance}
      close={close}
      tripId={tripId}
    >
      <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
        {/* unmount the form on modal close, resets the form values */}
        {open && stage === "form" && <UpdateCollectionFormModal />}
        {open && stage === "photos" && <CollectionFormPhotosModal />}
      </AlertDialog>
    </CollectionFormProvider>
  )
}

const UpdateCollectionFormModal = () => {
  const {
    close,
    form,
    onSubmit,
    isPending,
    setStage,
    tripId,
    showLocationMap,
    setShowLocationMap,
  } = useCollectionFormContext()

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

  const handleSelectLocation = useCallback(
    ({ lat, lng }: { lat: number; lng: number }) => {
      form.setValue("latitude", parseFloat(lat.toPrecision(8)), {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      })
      form.setValue("longitude", parseFloat(lng.toPrecision(9)), {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      })
    },
    [form],
  )

  const initialLocation = useMemo(() => {
    if (!form.watch("latitude") || !form.watch("longitude")) return undefined
    return {
      lat: form.watch("latitude"),
      lng: form.watch("longitude"),
    }
  }, [form])

  if (!tripId) return null

  if (showLocationMap)
    return (
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Select Collection Location</AlertDialogTitle>
          <CollectionLocationSelector
            tripId={tripId}
            initialLocation={initialLocation}
            onLocationSelected={handleSelectLocation}
            onClose={() => setShowLocationMap(false)}
          />
        </AlertDialogHeader>
      </AlertDialogContent>
    )

  return (
    <AlertDialogContent className="h-screen overflow-y-scroll">
      <AlertDialogHeader>
        <AlertDialogTitle>Update collection</AlertDialogTitle>
        <CollectionForm
          {...{ form }}
          tripId={tripId}
          setShowLocationMap={setShowLocationMap}
        />
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel className="w-full cursor-pointer" onClick={close}>
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={handleGoToPhotos}
          className="w-full cursor-pointer"
          disabled={isPending || !form.formState.isValid}
        >
          {!isPending && <span>{goToPhotosText}</span>}
          {isPending && <Spinner />}
        </AlertDialogAction>
        <AlertDialogAction
          onClick={onSubmit}
          className="w-full cursor-pointer"
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
