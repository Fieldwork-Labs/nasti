import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nasti/ui/alert-dialog"
import { ScoutingNote } from "@nasti/common/types"
import React, { useCallback, useMemo, useState } from "react"
import { ScoutingNotePhotoUpload } from "./ScoutingNotePhotoUpload"
import { Spinner } from "@nasti/ui/spinner"
import { ScoutingNoteForm } from "./ScoutingNoteForm"
import {
  ScoutingNoteFormProvider,
  useScoutingNoteFormContext,
} from "./ScoutingNoteFormContext"
import { DataItemLocationSelectorMap } from "../common/DataItemLocationSelectorMap"

export type ModalProps = {
  open: boolean
  onCancel?: () => void
  onSubmit?: () => void
  submitText?: string
  allowSubmit?: boolean
  title?: string
  isPending?: boolean
}

export const ScoutingNoteFormPhotosModal = () => {
  const { scoutingNote, close, setStage } = useScoutingNoteFormContext()

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Upload photos</AlertDialogTitle>

        {scoutingNote && (
          <ScoutingNotePhotoUpload scoutingNoteId={scoutingNote.id} />
        )}
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

export const AddScoutingNoteFormModal = () => {
  const {
    close,
    form,
    onSubmit,
    isPending,
    tripId,
    showLocationMap,
    setShowLocationMap,
    handleSelectLocation,
    initialLocation,
  } = useScoutingNoteFormContext()

  if (!tripId) return null

  if (showLocationMap)
    return (
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Select Scouting Note Location</AlertDialogTitle>
          <DataItemLocationSelectorMap
            tripId={tripId}
            initialLocation={initialLocation}
            onLocationSelected={handleSelectLocation}
            onClose={() => setShowLocationMap(false)}
          />
        </AlertDialogHeader>
      </AlertDialogContent>
    )

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>New scouting note</AlertDialogTitle>

        <ScoutingNoteForm {...{ form }} tripId={tripId} />
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

export const AddScoutingNoteWizardModal = ({
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
      <ScoutingNoteFormProvider
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
              {stage === "form" && <AddScoutingNoteFormModal />}
              {stage === "photos" && <ScoutingNoteFormPhotosModal />}
            </>
          )}
        </AlertDialog>
      </ScoutingNoteFormProvider>
    )
}

export const UpdateScoutingNoteWizardModal = ({
  instance,
  open,
  close,
}: ModalProps & {
  close: () => void
  instance: ScoutingNote
}) => {
  const [stage, setStage] = useState<"form" | "photos">("form")

  return (
    <ScoutingNoteFormProvider
      stage={stage}
      setStage={setStage}
      instance={instance}
      close={close}
    >
      <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
        {/* unmount the form on modal close, resets the form values */}
        {open && stage === "form" && <UpdateScoutingNoteFormModal />}
        {open && stage === "photos" && <ScoutingNoteFormPhotosModal />}
      </AlertDialog>
    </ScoutingNoteFormProvider>
  )
}

export const UpdateScoutingNoteFormModal = () => {
  const {
    close,
    form,
    onSubmit,
    isPending,
    setStage,
    tripId,
    showLocationMap,
    setShowLocationMap,
    handleSelectLocation,
    initialLocation,
  } = useScoutingNoteFormContext()

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

  if (!tripId) return null

  if (showLocationMap)
    return (
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Select Scouting Note Location</AlertDialogTitle>
          <DataItemLocationSelectorMap
            tripId={tripId}
            initialLocation={initialLocation}
            onLocationSelected={handleSelectLocation}
            onClose={() => setShowLocationMap(false)}
          />
        </AlertDialogHeader>
      </AlertDialogContent>
    )

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Update scouting note</AlertDialogTitle>
        <ScoutingNoteForm {...{ form }} tripId={tripId} />
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
