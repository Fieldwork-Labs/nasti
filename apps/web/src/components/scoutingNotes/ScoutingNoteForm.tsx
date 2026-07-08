import { InfoIcon } from "lucide-react"
import { Controller } from "react-hook-form"

import { Checkbox } from "@nasti/ui/checkbox"
import { FormField } from "@nasti/ui/formField"
import { Label, labelVariants } from "@nasti/ui/label"
import { MultiSelect, Option } from "@nasti/ui/multi-select"
import { PhenologyRangeInput } from "@nasti/ui/phenologyRangeInput"
import { withTooltip } from "@nasti/ui/tooltip"
import { SpeciesSearchCombobox } from "../species/SpeciesSearchCombobox"
import {
  ScoutingNoteFormProps,
  useScoutingNoteFormContext,
} from "./ScoutingNoteFormContext"
import { Button } from "@nasti/ui/button"
import { useEffect, useMemo, useState } from "react"
import { usePersons } from "@/hooks/usePersons"
import useUserStore from "@/store/userStore"

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

  const { scoutingNote, setShowLocationMap } = useScoutingNoteFormContext()
  const { user } = useUserStore()

  const speciesValue = watch("species_id")
  const selectedPersonIds = watch("person_ids")
  const { data: persons } = usePersons()
  const personOptions: Option[] = useMemo(
    () =>
      persons
        ?.filter(
          (person) =>
            person.is_active || selectedPersonIds?.includes(person.id),
        )
        .map((person) => ({
          value: person.id,
          label: person.job_role
            ? `${person.display_name} (${person.job_role})`
            : person.display_name,
        })) ?? [],
    [persons, selectedPersonIds],
  )

  const [showSpeciesInput, setShowSpeciesInput] = useState<boolean | null>(null)

  useEffect(() => {
    if (scoutingNote || selectedPersonIds?.length || !user?.id || !persons)
      return
    const currentPerson = persons.find(
      (person) => person.source_type === "user" && person.user_id === user.id,
    )
    if (currentPerson) {
      setValue("person_ids", [currentPerson.id], {
        shouldDirty: false,
        shouldValidate: true,
      })
    }
  }, [persons, scoutingNote, selectedPersonIds?.length, setValue, user?.id])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
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
                      <span className={labelVariants()}>
                        Specimen Collected
                      </span>
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

        <div className="space-y-2">
          <Label>People present</Label>
          <Controller
            control={control}
            name="person_ids"
            render={({ field }) => (
              <MultiSelect
                options={personOptions}
                onValueChange={field.onChange}
                value={field.value}
                defaultValue={field.value}
                placeholder="Select people"
              />
            )}
          />
        </div>

        <Controller
          control={control}
          name="phenology_start"
          render={({ field: startField }) => (
            <Controller
              control={control}
              name="phenology_peak"
              render={({ field: peakField }) => (
                <Controller
                  control={control}
                  name="phenology_end"
                  render={({ field: endField }) => (
                    <PhenologyRangeInput
                      value={[
                        startField.value,
                        peakField.value,
                        endField.value,
                      ]}
                      onValueChange={([start, peak, end]) => {
                        startField.onChange(start)
                        peakField.onChange(peak)
                        endField.onChange(end)
                      }}
                    />
                  )}
                />
              )}
            />
          )}
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
