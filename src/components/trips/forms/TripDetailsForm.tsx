import { FormField } from "@/components/ui/formField"
import { TripFormData } from "@/contexts/trip-form"
import { FieldErrors, UseFormRegister } from "react-hook-form"

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
