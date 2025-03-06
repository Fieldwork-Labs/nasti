import { FormField } from "@/components/ui/formField"
import { FieldErrors, UseFormRegister, useForm } from "react-hook-form"
import { supabase } from "@/lib/supabase"
import { Trip } from "@/types"
import { useCallback } from "react"

import useUserStore from "@/store/userStore"

export type TripFormData = {
  name: Trip["name"]
  startDate: Trip["start_date"]
  endDate: Trip["end_date"]
}

type TripFormOptions = {
  instance?: Trip
  onSuccess?: (trip?: Trip) => void
  onError?: (message: string) => void
}

export const useTripForm = ({
  instance,
  onSuccess,
  onError,
}: TripFormOptions) => {
  const { orgId, user } = useUserStore()

  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting, errors, isDirty },
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
      if (!isDirty) {
        onSuccess?.()
        return
      }

      const sbresponse = await supabase
        .from("trip")
        .upsert({
          id: instance ? instance.id : undefined,
          name,
          start_date: startDate,
          end_date: endDate,
          organisation_id: orgId,
          created_by: user?.id,
        })
        .select("*")
        .single()

      if (sbresponse.error) onError?.(sbresponse.error.message)
      else {
        // type assertion required because of bad typing in supabase for postgis geometry columns
        onSuccess?.(sbresponse.data as Trip)
      }
    },
    [orgId, isDirty, instance, user?.id, onError, onSuccess],
  )

  return {
    register,
    handleSubmit: handleSubmit(onSubmit),
    isValid,
    isSubmitting,
    errors,
  }
}

export const TripDetailsForm = ({
  register,
  errors,
}: {
  register: UseFormRegister<TripFormData>
  errors: FieldErrors<TripFormData>
}) => {
  return (
    <div className="flex flex-col gap-2">
      <FormField
        label="Trip Name"
        type="text"
        autoComplete="off"
        {...register("name", {
          required: "Required",
          minLength: { value: 2, message: "Minimum length of 2" },
        })}
        error={errors.name}
      />
      <FormField
        label="Start Date"
        type="date"
        {...register("startDate", {
          required: "Required",
        })}
        error={errors.startDate}
      />
      <FormField
        label="End Date"
        type="date"
        {...register("endDate", {
          required: "Required",
        })}
        error={errors.endDate}
      />
    </div>
  )
}
