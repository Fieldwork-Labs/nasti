import { supabase } from "@/lib/supabase"
import { Trip } from "@/types"
import { useCallback } from "react"

import useUserStore from "@/store/userStore"

import { useForm } from "react-hook-form"

export type TripFormData = {
  name: Trip["name"]
  startDate: Trip["start_date"]
  endDate: Trip["end_date"]
}

type TripFormOptions = {
  instance?: Trip
  onSuccess?: (trip: Trip) => void
  onError?: (message: string) => void
}

export const useTripForm = ({
  instance,
  onSuccess,
  onError,
}: TripFormOptions) => {
  const { orgId } = useUserStore()

  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting, errors },
  } = useForm<TripFormData>({
    mode: "all",
    values: instance
      ? {
          name: instance.name,
          startDate: instance.start_date,
          endDate: instance.end_date,
        }
      : undefined,
  })

  const onSubmit = useCallback(
    async ({ name, startDate, endDate }: TripFormData) => {
      if (!orgId) throw new Error("No organisation available")

      const sbresponse = await supabase
        .from("trip")
        .upsert({
          id: instance ? instance.id : undefined,
          name,
          start_date: startDate,
          end_date: endDate,
          organisation_id: orgId,
        })
        .select("*")
        .single()

      if (sbresponse.error) onError?.(sbresponse.error.message)
      else {
        // type assertion required because of bad typing in supabase for postgis geometry columns
        onSuccess?.(sbresponse.data as Trip)
      }
    },
    [orgId, instance, onSuccess, onError],
  )

  return {
    register,
    handleSubmit: handleSubmit(onSubmit),
    isValid,
    isSubmitting,
    errors,
  }
}
