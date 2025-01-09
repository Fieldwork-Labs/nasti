import { useQuery } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"

import { supabase } from "@/lib/supabase"
import { Species } from "@/types"

export const getSpecies = async (orgId: string) => {
  const { data, error } = await supabase
    .from("species")
    .select("*")
    .eq("organisation_id", orgId)

  if (error) throw new Error(error.message)

  return data as Species[]
}

export const useSpecies = () => {
  const { orgId } = useUserStore()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["species", orgId],
    queryFn: async () => {
      if (!orgId) {
        throw new Error("Organisation not found")
      }
      return getSpecies(orgId)
    },
    enabled: Boolean(orgId),
  })
  return { data, isLoading, isError, error }
}
