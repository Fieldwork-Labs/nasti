import { useOrganisationForm } from "@/hooks/useOrganisationForm"
import { useUpdateOrganisation } from "@/hooks/useUpdateOrganisation"
import useUserStore from "@/store/userStore"
import { useSetAcceptsTransfers } from "@/hooks/useTransfers"
import { Button } from "@nasti/ui/button"
import { FormField } from "@nasti/ui/formField"
import { useToast } from "@nasti/ui/hooks"
import { Switch } from "@nasti/ui/switch"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

export const Route = createFileRoute("/_private/settings/organisation-details")(
  {
    component: OrganisationFormPage,
  },
)

function OrganisationFormPage() {
  const { organisation, isAdmin } = useUserStore()
  const { toast } = useToast()
  const setAccepts = useSetAcceptsTransfers()

  const handleAcceptsChange = async (accepts: boolean) => {
    try {
      const result = await setAccepts.mutateAsync(accepts)
      const closed =
        result.cancelled_request_ids.length +
        result.cancelled_transfer_ids.length
      toast({
        description: accepts
          ? "Your organisation now accepts seed transfers"
          : closed > 0
            ? "Seed transfers turned off. Pending incoming requests were closed."
            : "Seed transfers turned off",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update transfer setting",
      })
    }
  }
  const navigate = useNavigate({
    from: "/settings/organisation-details",
  })

  const { mutateAsync: updateOrganisation } = useUpdateOrganisation()
  const {
    handleSubmit,
    register,
    isSubmitting,
    errors,
    formState: { isValid },
  } = useOrganisationForm({
    defaultValues: organisation ?? {},
    onSubmit: async (data) => {
      await updateOrganisation({
        id: organisation?.id,
        data: {
          name: data.name,
          contact_name: data.contact_name,
          contact_email: data.contact_email,
          contact_phone: data.contact_phone,
          contact_address: data.contact_address,
        },
      })
      navigate({ to: "/settings" })
    },
  })

  return (
    <div className="mt-6 flex flex-col gap-4 pb-6 sm:w-full md:w-1/2 lg:w-1/3">
      <div>
        <h4 className="mb-2 text-xl font-bold">Edit Organisation Details</h4>
      </div>
      {isAdmin && (
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="accepts-transfers" className="font-medium">
              Accept seed transfers from other organisations
            </label>
            <p className="text-sm text-gray-500">
              Turning this off closes pending incoming requests and releases the
              bags reserved for them. Turning it back on restores partners you
              had already accepted.
            </p>
          </div>
          <Switch
            id="accepts-transfers"
            checked={organisation?.accepts_transfers ?? true}
            disabled={setAccepts.isPending}
            onCheckedChange={handleAcceptsChange}
          />
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <FormField
          label="Organisation Name"
          type="text"
          {...register("name", {
            required: "Required",
            minLength: { value: 2, message: "Minimum length of 2" },
          })}
          error={errors.name}
        />
        <span className="text-lg">Organisation contact details</span>
        <FormField
          label="Contact Person's Name"
          type="text"
          {...register("contact_name", {
            minLength: { value: 2, message: "Minimum length of 2" },
          })}
          error={errors.contact_name}
        />
        <FormField
          label="Contact Email"
          type="text"
          {...register("contact_email")}
          error={errors.contact_email}
        />
        <FormField
          label="Contact Phone"
          type="text"
          {...register("contact_phone", {
            minLength: { value: 8, message: "Minimum length of 8" },
          })}
          error={errors.contact_phone}
        />
        <FormField
          label="Contact Address"
          type="text"
          {...register("contact_address", {
            minLength: { value: 2, message: "Minimum length of 2" },
          })}
          error={errors.contact_address}
        />

        <div className="flex gap-2">
          <Button
            variant={"secondary"}
            className="w-full cursor-pointer"
            onClick={() => navigate({ to: "/settings" })}
          >
            Cancel
          </Button>
          <Button
            className="w-full cursor-pointer"
            type="submit"
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  )
}
