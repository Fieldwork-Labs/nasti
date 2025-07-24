import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"

// Validation schema
const organisationSchema = z.object({
  name: z.string().min(1, "Organisation name is required"),
  contact_name: z.string().optional().nullable(),
  contact_email: z
    .string()
    .email("Invalid email format")
    .optional()
    .or(z.literal(""))
    .nullable(),
  contact_phone: z.string().optional().nullable(),
  contact_address: z.string().optional().nullable(),
})

export type OrganisationFormData = z.infer<typeof organisationSchema>

interface UseOrganisationFormProps {
  defaultValues?: Partial<OrganisationFormData>
  onSubmit: (data: OrganisationFormData) => Promise<void> | void
}

export const useOrganisationForm = ({
  defaultValues,
  onSubmit,
}: UseOrganisationFormProps) => {
  const form = useForm<OrganisationFormData>({
    resolver: zodResolver(organisationSchema),
    defaultValues: {
      name: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      contact_address: "",
      ...defaultValues,
    },
  })

  useEffect(() => {
    if (defaultValues)
      Object.entries(defaultValues).forEach(([key, value]) => {
        form.setValue(key as keyof OrganisationFormData, value)
      })
  }, [defaultValues, form])

  const handleSubmit = form.handleSubmit(async (data) => {
    try {
      await onSubmit(data)
    } catch (error) {
      console.error("Form submission error:", error)
      // You might want to set form errors here
      form.setError("root", {
        type: "manual",
        message: "An error occurred while saving the organisation",
      })
    }
  })

  return {
    ...form,
    handleSubmit,
    isSubmitting: form.formState.isSubmitting,
    errors: form.formState.errors,
  }
}
