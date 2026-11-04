import { Controller, UseFormReturn } from "react-hook-form"

import { PhenologyRangeInput } from "@nasti/ui/phenologyRangeInput"

export type PhenologyFormValues = {
  phenology_start: number | null
  phenology_peak: number | null
  phenology_end: number | null
}

export const PhenologyField = <T extends PhenologyFormValues>({
  form: parentForm,
}: {
  form: UseFormReturn<T>
}) => {
  // UseFormReturn is invariant in its values type; see SpeciesInputSection.
  const form = parentForm as unknown as UseFormReturn<PhenologyFormValues>
  const { control } = form

  return (
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
                  value={[startField.value, peakField.value, endField.value]}
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
  )
}
