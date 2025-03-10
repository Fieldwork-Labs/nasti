import { supabase } from "@/lib/supabase"
import { queryClient } from "@/lib/utils"
import { Species } from "@nasti/common/types"
import { useMutation } from "@tanstack/react-query"
import { PaginatedSpeciesList } from "./useSpecies"

type SpeciesWithId = Partial<Species> & Pick<Species, "id">

const updateSpecies = async (updatedItem: SpeciesWithId) => {
  const { data, error } = await supabase
    .from("species")
    .update(updatedItem)
    .eq("id", updatedItem.id)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("No data returned from species update")

  return data as Species
}

export const useUpdateSpecies = () => {
  return useMutation<Species, unknown, SpeciesWithId>({
    mutationFn: (updatedItem) => updateSpecies(updatedItem),
    onSuccess: (updatedItem, variables) => {
      // Update the individual item cache
      queryClient.setQueryData(["species", "detail", variables.id], updatedItem)

      // Get all existing paginated queries
      const queries = queryClient.getQueriesData({
        queryKey: ["species", "list"],
      })

      // Update each paginated query that exists in cache
      queries.forEach(([queryKey]) => {
        queryClient.setQueryData<PaginatedSpeciesList>(queryKey, (oldData) => {
          if (!oldData?.data) return oldData
          return {
            ...oldData,
            items: oldData.data.map((item) =>
              item.id === updatedItem.id ? updatedItem : item,
            ),
          }
        })
      })
    },
  })
}
