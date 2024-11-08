import { useToast } from "@/hooks/use-toast"
import { Trip } from "@/types"
import { useCallback } from "react"
import { useForm } from "react-hook-form"
import { FormField } from "../ui/formField"
import { Button } from "../ui/button"
import useUserStore from "@/store/userStore"
import { supabase } from "@/lib/supabase"

import { useNavigate } from "@tanstack/react-router"
import { ButtonLink } from "../ui/buttonLink"

export type TripFormData = {
  name: Trip["name"]
  startDate: Trip["start_date"]
  endDate: Trip["end_date"]
}

type TripFormProps = {
  instance?: Trip
}

export const TripForm = ({ instance }: TripFormProps) => {
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
  const { orgId } = useUserStore()
  const { toast } = useToast()
  const navigate = useNavigate()

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
        .single()

      if (sbresponse.error)
        toast({
          variant: "destructive",
          description: sbresponse.error.message,
        })
      else {
        toast({
          description: `Trip ${instance ? "edited" : "created"} successfully`,
        })

        navigate({ to: "/trips" })
      }
    },
    [orgId, instance, toast, navigate],
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
      <FormField
        label="Trip Name"
        type="text"
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
      <div className="flex gap-2">
        <ButtonLink variant={"secondary"} to="/trips" className="w-full">
          Cancel
        </ButtonLink>
        <Button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="w-full"
        >
          {isSubmitting ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </form>
  )
}
