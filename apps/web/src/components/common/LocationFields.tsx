import { UseFormReturn } from "react-hook-form"

import { Button } from "@nasti/ui/button"
import { FormField } from "@nasti/ui/formField"
import { Label } from "@nasti/ui/label"

export type LocationFormValues = {
  latitude: number
  longitude: number
}

export const LocationFields = <T extends LocationFormValues>({
  form: parentForm,
  onSelectOnMap,
}: {
  form: UseFormReturn<T>
  onSelectOnMap: () => void
}) => {
  // UseFormReturn is invariant in its values type; see SpeciesInputSection.
  const form = parentForm as unknown as UseFormReturn<LocationFormValues>
  const {
    register,
    formState: { errors },
  } = form

  return (
    <>
      <div className="flex items-center justify-between">
        <Label className="col-span-2">
          Location Coordinate (decimal degrees, WGS84)
        </Label>
        <Button variant={"outline"} size={"sm"} onClick={onSelectOnMap}>
          Select on Map
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
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
    </>
  )
}
