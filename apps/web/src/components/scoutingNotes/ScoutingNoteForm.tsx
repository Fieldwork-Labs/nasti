import { type ScoutingNote } from "@nasti/common/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { InfoIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { Checkbox } from "@nasti/ui/checkbox"
import useUserStore from "@/store/userStore"
import { SpeciesSearchCombobox } from "../species/SpeciesSearchCombobox"
import { FormField } from "@nasti/ui/formField"
import { Label, labelVariants } from "@nasti/ui/label"
import { withTooltip } from "@nasti/ui/tooltip"
import { parsePostGISPoint } from "@nasti/common/utils"
import { useUpdateScoutingNote } from "@/hooks/useUpdateScoutingNote"

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

export const useScoutingNoteForm = ({
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
    criteriaMode: "all",
    reValidateMode: "onChange",
  })

  useEffect(() => {
    // Only reset if the form has been mounted already
    if (form) {
      form.reset(defaultValues)
    }
  }, [defaultValues, form])

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
        onSuccess(updatedRecord)
      }
    },
    [user, organisation, tripId, scoutingNote, updateScoutingNote, onSuccess],
  )

  return {
    tripId,
    scoutingNote,
    form,
    onSubmit: form.handleSubmit(onSubmit),
    isPending,
  }
}

type ScoutingNoteFormProps = Pick<
  ReturnType<typeof useScoutingNoteForm>,
  "form" | "tripId"
>

// Create tooltip-wrapped component
const InfoIconWithTooltip = withTooltip(
  <InfoIcon className="h-4 w-4 text-xs" />,
)

export const ScoutingNoteForm = ({ form, tripId }: ScoutingNoteFormProps) => {
  const {
    register,
    control,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = form

  useEffect(() => {
    return () => reset()
  }, [reset])

  const speciesValue = watch("species_id")

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Species Selector */}
        <SpeciesSearchCombobox
          onChange={(id) => setValue("species_id", id, { shouldDirty: true })}
          value={speciesValue}
          tripId={tripId}
        />

        {/* Species Uncertain Checkbox */}
        <Controller
          control={control}
          name="species_uncertain"
          render={({ field }) => (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="species_uncertain"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <label htmlFor="species_uncertain">
                <span className="inline-flex items-center gap-2">
                  <span className={labelVariants()}>Species Uncertain</span>
                  <InfoIconWithTooltip>
                    Check this box if you are uncertain about the identification
                    of the species.
                  </InfoIconWithTooltip>
                </span>
              </label>
            </div>
          )}
        />

        {/* Field Name */}
        <FormField
          label={
            <span className="inline-flex items-center gap-2">
              <span className={labelVariants()}>Field Name</span>
              <InfoIconWithTooltip>
                An informal name given to the species in the field if taxonomic
                identification uncertain.
              </InfoIconWithTooltip>
            </span>
          }
          {...register("field_name")}
          autoComplete="off"
          error={errors.field_name}
        />

        {/* Specimen Collected Checkbox */}
        <Controller
          control={control}
          name="specimen_collected"
          render={({ field }) => (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="specimen_collected"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <label htmlFor="specimen_collected">
                <span className="inline-flex items-center gap-2">
                  <span className={labelVariants()}>Specimen Collected</span>
                  <InfoIconWithTooltip>
                    Check this box if a specimen was collected.
                  </InfoIconWithTooltip>
                </span>
              </label>
            </div>
          )}
        />

        {/* Location */}
        <div className="grid grid-cols-2 gap-4">
          <Label className="col-span-2">
            Location Coordinate (decimal degrees, WGS84)
          </Label>
          <FormField
            label="Latitude"
            type="number"
            step="any"
            autoComplete="off"
            {...register("latitude", {
              valueAsNumber: true, // Transform string to number
            })}
            error={errors.latitude}
            placeholder="-32"
          />
          <FormField
            label="Longitude"
            type="number"
            step="any"
            autoComplete="off"
            {...register("longitude", {
              valueAsNumber: true, // Transform string to number
            })}
            error={errors.longitude}
            placeholder="122"
          />
        </div>

        {/* Description */}
        <FormField
          label="Description"
          type="textarea"
          autoComplete="off"
          {...register("description")}
          error={errors.description}
        />
      </div>
      {errors.root && (
        <div className="flex h-4 justify-end text-xs text-orange-800">
          {errors.root.message}
        </div>
      )}
    </div>
  )
}
