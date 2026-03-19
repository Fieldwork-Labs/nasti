import { InfoIcon } from "lucide-react"
import { Controller } from "react-hook-form"

import { Checkbox } from "@nasti/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nasti/ui/select"
import { SpeciesSearchCombobox } from "../species/SpeciesSearchCombobox"

import { usePeople } from "@/hooks/usePeople"
import { Button } from "@nasti/ui/button"
import { FormField } from "@nasti/ui/formField"
import { Label, labelVariants } from "@nasti/ui/label"
import { withTooltip } from "@nasti/ui/tooltip"
import {
  CollectionFormProps,
  useCollectionFormContext,
} from "./CollectionFormContext"
import { useState } from "react"

// Create tooltip-wrapped component
const InfoIconWithTooltip = withTooltip(
  <InfoIcon className="h-4 w-4 text-xs" />,
)

export const CollectionForm = ({ form, tripId }: CollectionFormProps) => {
  const {
    register,
    control,
    formState: { errors },
    setValue,
    watch,
  } = form

  const { setShowLocationMap } = useCollectionFormContext()

  const speciesValue = watch("species_id")

  const { data: people } = usePeople()

  const [showSpeciesInput, setShowSpeciesInput] = useState<boolean | null>(null)

  return (
    <div className="space-y-6 overflow-y-scroll">
      {showSpeciesInput === null && (
        <div className="flex w-full gap-2">
          <Button
            className="w-full"
            onClick={() => setShowSpeciesInput(true)}
            variant="outline"
          >
            Select Species
          </Button>
          <Button
            className="w-full"
            onClick={() => {
              setValue("species_uncertain", true, {
                shouldDirty: true,
                shouldValidate: true,
              })
              setShowSpeciesInput(false)
            }}
            variant="outline"
          >
            Enter Specimen Name
          </Button>
        </div>
      )}
      {showSpeciesInput !== null && (
        <div className="space-y-2">
          {showSpeciesInput && (
            <SpeciesSearchCombobox
              onChange={(id) =>
                setValue("species_id", id, { shouldDirty: true })
              }
              value={speciesValue}
              tripId={tripId}
            />
          )}

          {/* Field Name */}
          {showSpeciesInput === false && (
            <FormField
              label={
                <span className="inline-flex items-center gap-2">
                  <span className={labelVariants()}>Specimen Name</span>
                  <InfoIconWithTooltip>
                    An informal name given to the species in the field if
                    taxonomic identification uncertain.
                  </InfoIconWithTooltip>
                </span>
              }
              {...register("field_name")}
              autoComplete="off"
              error={errors.field_name}
            />
          )}

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
                      Check this box if you are uncertain about the
                      identification of the species.
                    </InfoIconWithTooltip>
                  </span>
                </label>
              </div>
            )}
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
        </div>
      )}

      <FormField
        label="Collected On"
        type="date"
        autoComplete="off"
        {...register("collected_on")}
        error={errors.collected_on}
      />

      <div className="space-y-2">
        <Label>Collector</Label>
        <Controller
          control={control}
          name="collected_by"
          render={({ field }) => (
            <Select
              onValueChange={field.onChange}
              value={field.value ?? undefined}
            >
              <SelectTrigger
                className="w-full max-w-48"
                value={field.value ?? undefined}
                onBlur={field.onBlur}
              >
                <SelectValue placeholder="Select a person" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {people?.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
      </div>

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
        autoComplete="off"
        {...register("description")}
        error={errors.description}
      />

      <FormField
        label="Amount Description"
        type="input"
        step="any"
        autoComplete="off"
        {...register("amount_description")}
        error={errors.amount_description}
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
      {errors.root && (
        <div className="flex h-4 justify-end text-xs text-orange-800">
          {errors.root.message}
        </div>
      )}
    </div>
  )
}
