import { ScoutingNote } from "@nasti/common/types"
import { createContext, useContext, useEffect } from "react"
import { useScoutingNoteForm } from "./ScoutingNoteForm"

type ScoutingNoteFormStage = "form" | "photos"

type UseScoutingNoteFormReturn = ReturnType<typeof useScoutingNoteForm>

type ScoutingNoteFormProviderProps = {
  stage: ScoutingNoteFormStage
  setStage: (stage: ScoutingNoteFormStage) => void
  scoutingNote: ScoutingNote | undefined
  close: () => void
} & UseScoutingNoteFormReturn

const ScoutingNoteFormContext = createContext<
  ScoutingNoteFormProviderProps | undefined
>(undefined)

export const useScoutingNoteFormContext = () => {
  const context = useContext(ScoutingNoteFormContext)
  if (!context) {
    throw new Error(
      "useScoutingNoteFormContext must be used within a ScoutingNoteFormProvider",
    )
  }
  return context
}

export const ScoutingNoteFormProvider = ({
  stage,
  setStage,
  close,
  children,
  tripId,
  instance,
}: {
  instance?: ScoutingNote
  tripId?: string
  stage: ScoutingNoteFormStage
  setStage: (stage: ScoutingNoteFormStage) => void
  close: () => void
  children: React.ReactNode
}) => {
  const { onSubmit, isPending, form, scoutingNote } = useScoutingNoteForm({
    tripId,
    instance,
    onSuccess: (_) => {
      setStage("photos")
    },
  })

  useEffect(() => {
    return () => form.reset()
  }, [form])

  return (
    <ScoutingNoteFormContext.Provider
      value={{
        stage,
        setStage,
        close,
        onSubmit,
        scoutingNote,
        isPending,
        form,
        tripId,
      }}
    >
      {children}
    </ScoutingNoteFormContext.Provider>
  )
}
