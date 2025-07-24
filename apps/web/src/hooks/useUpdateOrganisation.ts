import { useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import type { OrganisationFormData } from "./useOrganisationForm"
import { Organisation } from "@nasti/common/types"

interface UpdateOrganisationParams {
  id?: string
  data: OrganisationFormData
}

const updateOrganisation = async ({
  id,
  data,
}: UpdateOrganisationParams): Promise<Organisation> => {
  if (!id) throw new Error("No organisation ID provided")
  const { data: result, error } = await supabase
    .from("organisation")
    .update({
      name: data.name,
      contact_name: data.contact_name || null,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      contact_address: data.contact_address || null,
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!result) {
    throw new Error("Organisation not found")
  }

  return result
}

interface UseUpdateOrganisationOptions {
  onSuccess?: (data: Organisation) => void
  onError?: (error: Error) => void
}

export const useUpdateOrganisation = (
  options?: UseUpdateOrganisationOptions,
) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateOrganisation,
    onSuccess: (data) => {
      // Invalidate and refetch organisation queries
      queryClient.invalidateQueries({
        queryKey: ["organisation", data.id],
      })

      // Optionally update the cache directly
      queryClient.setQueryData(["organisation", data.id], data)

      options?.onSuccess?.(data)
    },
    onError: (error: Error) => {
      console.error("Failed to update organisation:", error)
      options?.onError?.(error)
    },
  })
}
