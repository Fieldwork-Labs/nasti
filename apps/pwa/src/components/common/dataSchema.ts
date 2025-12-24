import { z } from "zod"

export type BaseFormData = {
  species_id: string | null
  species_uncertain: boolean
  field_name: string
  specimen_collected: boolean
  description: string
}

export const baseSchema = z
  .object({
    species_id: z.preprocess((val) => {
      if (val === "" || val === undefined) return null
      return val
    }, z.string().nullable()),
    species_uncertain: z.boolean(),
    field_name: z
      .string()
      .optional()
      .transform((val) => val || ""),
    specimen_collected: z.boolean(),
    description: z
      .string()
      .optional()
      .transform((val) => val || ""),
  })
  .refine(
    (data) => {
      // Form is valid if either species_id OR field_name is provided
      return (
        Boolean(data.species_id) ||
        (data.field_name && data.field_name.trim().length > 0)
      )
    },
    {
      message: "Field name is required when no species is selected",
      path: ["field_name"],
    },
  )

export const baseDefaultValues = {
  species_id: null,
  species_uncertain: false,
  field_name: "",
  specimen_collected: false,
  description: "",
}
