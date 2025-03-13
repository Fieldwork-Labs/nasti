import {
  createFileRoute,
  CatchNotFound,
  useLoaderData,
} from "@tanstack/react-router"
import { queryClient } from "@/lib/utils"
import { Trip } from "@nasti/common/types"
import { getTrips } from "@/queries/trips"
import { useAdminOnly } from "@/hooks/useAdminOnly"

import { useTripForm } from "@/components/trips/forms/TripDetailsForm"
import { useNavigate } from "@tanstack/react-router"
import { useToast } from "@nasti/ui/hooks"
import { FormField } from "@nasti/ui/formField"
import { ButtonLink } from "@nasti/ui/button-link"
import { Button } from "@nasti/ui/button"
import { useCallback } from "react"

const TripFormEdit = () => {
  useAdminOnly()
  const { instance } = useLoaderData({ from: "/_private/trips/$id/edit" })

  const navigate = useNavigate()
  const { toast } = useToast()
  const onSuccess = useCallback(() => {
    toast({
      description: `Trip updated successfully`,
    })

    navigate({ to: "/trips" })
  }, [navigate, toast])

  const { register, handleSubmit, isValid, isSubmitting, errors } = useTripForm(
    {
      instance,
      onSuccess,
      onError: (message) => {
        toast({ variant: "destructive", description: message })
      },
    },
  )

  if (!instance) return <CatchNotFound>Trip Not found</CatchNotFound>

  return (
    <div className="mt-6 flex flex-col gap-4 pb-6 sm:w-full md:w-1/2 lg:w-1/3">
      <div>
        <h4 className="mb-2 text-xl font-bold">Edit Trip</h4>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
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
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/$id/edit")({
  loader: async ({ params, context }) => {
    // TODO find out why no orgID present in this function on reload
    const { id } = params
    const { orgId } = context
    if (!orgId) console.error("no org id")

    const tripsQueryData = await queryClient.ensureQueryData<Trip[]>({
      queryKey: ["trips", orgId],
      queryFn: () => {
        if (!orgId) {
          return Promise.resolve([])
        }
        return getTrips(orgId)
      },
    })

    const instance = tripsQueryData.find((t) => t.id === id)

    return { instance }
  },
  component: TripFormEdit,
})
