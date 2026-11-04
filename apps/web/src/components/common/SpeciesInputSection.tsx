import { useState } from "react"
import { Controller, UseFormReturn } from "react-hook-form"

import { Button } from "@nasti/ui/button"
import { Checkbox } from "@nasti/ui/checkbox"
import { FormField } from "@nasti/ui/formField"
import { labelVariants } from "@nasti/ui/label"

import { SpeciesSearchCombobox } from "../species/SpeciesSearchCombobox"
import { InfoIconWithTooltip } from "./InfoIconWithTooltip"

export type SpeciesFormValues = {
  species_id: string | null
  species_uncertain: boolean
  field_name: string
  specimen_collected: boolean
}

/**
 * Species / specimen name entry shared by the collection and scouting note
 * forms. Those forms unmount while the location map is open, so the initial
 * choice is derived from the form values rather than resetting to the chooser.
 */
export const SpeciesInputSection = <T extends SpeciesFormValues>({
  form: parentForm,
  tripId,
}: {
  form: UseFormReturn<T>
  tripId?: string
}) => {
  // react-hook-form's UseFormReturn is invariant in its values type, so a form
  // with more fields can't be passed where this subset is expected. The parent's
  // fields are a superset of ours, so narrowing is safe.
  const form = parentForm as unknown as UseFormReturn<SpeciesFormValues>
  const {
    register,
    control,
    formState: { errors },
    setValue,
    watch,
  } = form

  const speciesValue = watch("species_id")

  const [showSpeciesInput, setShowSpeciesInput] = useState<boolean | null>(
    () => {
      const { species_id, field_name, species_uncertain } = form.getValues()
      if (species_id) return true
      if (field_name?.trim() || species_uncertain) return false
      return null
    },
  )

  if (showSpeciesInput === null)
    return (
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
    )

  return (
    <div className="space-y-2">
      {showSpeciesInput && (
        <SpeciesSearchCombobox
          onChange={(id) => setValue("species_id", id, { shouldDirty: true })}
          value={speciesValue}
          tripId={tripId}
        />
      )}

      {showSpeciesInput === false && (
        <FormField
          label={
            <span className="inline-flex items-center gap-2">
              <span className={labelVariants()}>Specimen Name</span>
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
                  Check this box if you are uncertain about the identification
                  of the species.
                </InfoIconWithTooltip>
              </span>
            </label>
          </div>
        )}
      />

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
  )
}
