import { InfoIcon } from "lucide-react"
import { Controller } from "react-hook-form"

import { Checkbox } from "@nasti/ui/checkbox"
import { FormField } from "@nasti/ui/formField"
import { Label, labelVariants } from "@nasti/ui/label"
import { withTooltip } from "@nasti/ui/tooltip"
import { SpeciesSearchCombobox } from "../species/SpeciesSearchCombobox"
import {
  ScoutingNoteFormProps,
  useScoutingNoteFormContext,
} from "./ScoutingNoteFormContext"
import { Button } from "@nasti/ui/button"

// Create tooltip-wrapped component
const InfoIconWithTooltip = withTooltip(
  <InfoIcon className="h-4 w-4 text-xs" />,
)

export const ScoutingNoteForm = ({ form, tripId }: ScoutingNoteFormProps) => {
  const {
    register,
    control,
    formState: { errors },
    setValue,
    watch,
  } = form

  const { setShowLocationMap } = useScoutingNoteFormContext()

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
        <div className="flex items-center justify-between">
          <Label className="col-span-2">
            Location Coordinate (decimal degrees, WGS84)
          </Label>
          <Button
            variant={"outline"}
            size={"sm"}
            onClick={() => setShowLocationMap(true)}
          >
            Select on Map
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
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
