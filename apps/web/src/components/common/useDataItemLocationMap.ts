import { useCallback, useMemo, useState } from "react"
import { UseFormReturn } from "react-hook-form"

type WithLocation = {
  latitude: number
  longitude: number
}

export const useDataItemLocationMap = <T extends WithLocation>({
  form,
}: {
  form: UseFormReturn<T>
}) => {
  const [showLocationMap, setShowLocationMap] = useState(false)

  const handleSelectLocation = useCallback(
    ({ lat, lng }: { lat: number; lng: number }) => {
      form.setValue(
        "latitude" as Parameters<typeof form.setValue>[0],
        // @ts-expect-error janky stuff
        parseFloat(lat.toPrecision(8)),
        {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        },
      )
      form.setValue(
        "longitude" as Parameters<typeof form.setValue>[0],
        // @ts-expect-error janky stuff
        parseFloat(lng.toPrecision(9)),
        {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        },
      )
    },
    [form],
  )

  const initialLocation = useMemo(() => {
    // @ts-expect-error janky stuff
    const lat = form.getValues(
      // @ts-expect-error janky stuff
      "latitude" as Parameters<typeof form.getValues>[0],
    ) as number | undefined
    // @ts-expect-error janky stuff
    const lng = form.getValues(
      // @ts-expect-error janky stuff
      "longitude" as Parameters<typeof form.getValues>[0],
    ) as number | undefined
    if (!lat || !lng) return undefined
    return { lat, lng }
  }, [form])

  return {
    showLocationMap,
    setShowLocationMap,
    handleSelectLocation,
    initialLocation,
  }
}
