import { FormField } from "@/components/ui/formField"
import { useTripForm, useTripFormWizard } from "@/contexts/trip-form"
import { useNavigate } from "@tanstack/react-router"
import { TripWizardStage } from "./lib"

export const TripDetailsForm = () => {
  const { setCurrentStep, setTrip } = useTripFormWizard()

  const { register, handleSubmit, isValid, isSubmitting, errors } = useTripForm(
    {
      onSuccess: (trip) => {
        setTrip(trip)
        setCurrentStep(1)
      },
    },
  )
  const navigate = useNavigate()

  return (
    <TripWizardStage
      title="New Trip"
      submitLabel="Next"
      allowSubmit={isValid}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={() => navigate({ to: "/trips" })}
    >
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
    </TripWizardStage>
  )
}
