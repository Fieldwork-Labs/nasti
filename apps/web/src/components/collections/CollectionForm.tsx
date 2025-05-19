import { type Collection } from "@nasti/common/types"
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
import { useUpdateCollection } from "../../hooks/useUpdateCollection"
import { parsePostGISPoint } from "@nasti/common/utils"

type CollectionFormData = {
  species_id: string | null
  species_uncertain: boolean
  field_name: string
  specimen_collected: boolean
  latitude: number
  longitude: number
  description: string
  weight_estimate_kg: number | null
  plants_sampled_estimate: number | null
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
    weight_estimate_kg: z.number().nullable(),
    plants_sampled_estimate: z.number().nullable(),
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

export const useCollectionForm = ({
  instance,
  tripId,
  onSuccess,
}: {
  instance?: Collection
  tripId?: string
  onSuccess: (collection: Collection) => void
}) => {
  const { orgId, user } = useUserStore()
  const [collection, setCollection] = useState<Collection | undefined>(instance)

  const defaultValues = useMemo(() => {
    return collection
      ? {
          species_id: collection.species_id,
          species_uncertain: Boolean(collection.species_uncertain),
          field_name: collection.field_name ?? "",
          ...(collection?.location
            ? parsePostGISPoint(collection.location)
            : {
                latitude: undefined,
                longitude: undefined,
              }),
          specimen_collected: Boolean(collection.specimen_collected),
          description: collection.description ?? "",
          weight_estimate_kg: collection.weight_estimate_kg,
          plants_sampled_estimate: collection.plants_sampled_estimate,
        }
      : {
          species_id: null,
          species_uncertain: false,
          field_name: "",
          latitude: undefined,
          longitude: undefined,
          specimen_collected: false,
          description: "",
          weight_estimate_kg: null,
          plants_sampled_estimate: null,
        }
  }, [collection])

  const form = useForm<CollectionFormData>({
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
    mutateAsync: updateCollection,
    isPending,
    error: updateCollectionError,
  } = useUpdateCollection()

  if (updateCollectionError) form.setError("root", updateCollectionError)

  const onSubmit = useCallback(
    async (data: CollectionFormData) => {
      if (!user || !orgId) throw new Error("Not logged in")

      if (!tripId && !collection?.trip_id)
        throw new Error(
          "tripId or collection must be supplied to CollectionForm",
        )

      // type assertion safe because of check above
      const trip_id = (collection ? collection.trip_id : tripId) as string

      const { latitude, longitude, ...rest } = data
      const location = `POINT(${longitude} ${latitude})`
      const newCollection = {
        ...rest,
        id: collection?.id,
        created_by: user.id,
        location,
        organisation_id: orgId,
        trip_id,
      }
      const updatedRecord = await updateCollection(newCollection)

      if (onSuccess && updatedRecord) {
        setCollection(updatedRecord)
        onSuccess(updatedRecord)
      }
    },
    [user, orgId, tripId, collection, updateCollection, onSuccess],
  )

  return {
    tripId,
    collection,
    form,
    onSubmit: form.handleSubmit(onSubmit),
    isPending,
  }
}

type CollectionFormProps = Pick<
  ReturnType<typeof useCollectionForm>,
  "form" | "tripId"
>

// Create tooltip-wrapped component
const InfoIconWithTooltip = withTooltip(
  <InfoIcon className="h-4 w-4 text-xs" />,
)

export const CollectionForm = ({ form, tripId }: CollectionFormProps) => {
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
          autoComplete="off"
          {...register("description")}
          error={errors.description}
        />

        {/* Weight Estimate */}
        <FormField
          label="Weight Estimate (kg)"
          type="number"
          step="any"
          autoComplete="off"
          {...register("weight_estimate_kg", {
            valueAsNumber: true, // Transform string to number
          })}
          error={errors.weight_estimate_kg}
        />

        {/* Plants Sampled Estimate */}
        <FormField
          label="Plants Sampled Estimate"
          type="number"
          autoComplete="off"
          step="1"
          {...register("plants_sampled_estimate", {
            valueAsNumber: true, // Transform string to number
          })}
          error={errors.plants_sampled_estimate}
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
