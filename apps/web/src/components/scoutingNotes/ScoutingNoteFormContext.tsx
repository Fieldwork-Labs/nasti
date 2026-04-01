import { zodResolver } from "@hookform/resolvers/zod"
import { ScoutingNote } from "@nasti/common/types"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { useUpdateScoutingNote } from "@/hooks/useUpdateScoutingNote"
import useUserStore from "@/store/userStore"
import { parsePostGISPoint } from "@nasti/common/utils"
import { useDataItemLocationMap } from "../common/useDataItemLocationMap"

type ScoutingNoteFormData = {
  species_id: string | null
  species_uncertain: boolean
  field_name: string
  specimen_collected: boolean
  latitude: number
  longitude: number
  description: string
}

const schema = z
  .object({
    species_id: z.string().nullable(),
    species_uncertain: z.boolean(),
    field_name: z.string(),
    specimen_collected: z.boolean(),
    latitude: z
      .number({
        required_error: "Latitude is required",
        invalid_type_error: "Latitude must be a number",
      })
      .min(-90)
      .max(90),
    longitude: z
      .number({
        required_error: "Longitude is required",
        invalid_type_error: "Longitude must be a number",
      })
      .min(-180)
      .max(180),

    description: z.string(),
  })
  .refine(
    (data) => {
      // If species_id is not specified, field_name should be specified
      if (!data.species_id) {
        return data.field_name.trim().length > 0
      }
      return true
    },
    {
      message: "Field name is required when no species is selected",
      path: ["field_name"],
    },
  )

const useScoutingNoteForm = ({
  instance,
  tripId,
  onSuccess,
}: {
  instance?: ScoutingNote
  tripId?: string
  onSuccess: (scoutingNote: ScoutingNote) => void
}) => {
  const { organisation, user } = useUserStore()
  const [scoutingNote, setScoutingNote] = useState<ScoutingNote | undefined>(
    instance,
  )

  const defaultValues = useMemo(() => {
    return scoutingNote
      ? {
          species_id: scoutingNote.species_id,
          species_uncertain: Boolean(scoutingNote.species_uncertain),
          field_name: scoutingNote.field_name ?? "",
          ...(scoutingNote?.location
            ? parsePostGISPoint(scoutingNote.location)
            : {
                latitude: undefined,
                longitude: undefined,
              }),
          specimen_collected: Boolean(scoutingNote.specimen_collected),
          description: scoutingNote.description ?? "",
        }
      : {
          species_id: null,
          species_uncertain: false,
          field_name: "",
          latitude: undefined,
          longitude: undefined,
          specimen_collected: false,
          description: "",
        }
  }, [scoutingNote])

  const form = useForm<ScoutingNoteFormData>({
    defaultValues,
    resolver: zodResolver(schema),
    mode: "onChange",
  })

  const {
    mutateAsync: updateScoutingNote,
    isPending,
    error: updateScoutingNoteError,
  } = useUpdateScoutingNote()

  if (updateScoutingNoteError) form.setError("root", updateScoutingNoteError)

  const onSubmit = useCallback(
    async (data: ScoutingNoteFormData) => {
      if (!user || !organisation?.id) throw new Error("Not logged in")

      if (!tripId && !scoutingNote?.trip_id)
        throw new Error(
          "tripId or scoutingNote must be supplied to ScoutingNoteForm",
        )

      // type assertion safe because of check above
      const trip_id = (scoutingNote ? scoutingNote.trip_id : tripId) as string

      const { latitude, longitude, ...rest } = data
      const location = `POINT(${longitude} ${latitude})`
      const newNote = {
        ...rest,
        id: scoutingNote?.id,
        created_by: user.id,
        location,
        organisation_id: organisation.id,
        trip_id,
      }
      const updatedRecord = await updateScoutingNote(newNote)

      if (onSuccess && updatedRecord) {
        setScoutingNote(updatedRecord)
        form.reset(data)
        onSuccess(updatedRecord)
      }
    },
    [
      user,
      organisation,
      tripId,
      scoutingNote,
      updateScoutingNote,
      onSuccess,
      form,
    ],
  )

  const {
    showLocationMap,
    setShowLocationMap,
    handleSelectLocation,
    initialLocation,
  } = useDataItemLocationMap({
    form,
  })

  return {
    tripId,
    scoutingNote,
    form,
    onSubmit: form.handleSubmit(onSubmit),
    handleSelectLocation,
    initialLocation,
    showLocationMap,
    setShowLocationMap,
    isPending,
  }
}

export type ScoutingNoteFormProps = Pick<
  ReturnType<typeof useScoutingNoteForm>,
  "form" | "tripId"
>
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
  const {
    onSubmit,
    isPending,
    form,
    scoutingNote,
    showLocationMap,
    setShowLocationMap,
    handleSelectLocation,
    initialLocation,
  } = useScoutingNoteForm({
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
        showLocationMap,
        setShowLocationMap,
        handleSelectLocation,
        initialLocation,
        isPending,
        form,
        tripId,
      }}
    >
      {children}
    </ScoutingNoteFormContext.Provider>
  )
}
