import { useQuery } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"

import { supabase } from "@/lib/supabase"
import { Species } from "@/types"

export const getSpecies = async (
  orgId: string,
  page: number,
  pageSize: number = 100,
) => {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from("species")
    .select("*", { count: "exact" }) // Get the total count of species
    .eq("organisation_id", orgId)
    .range(from, to)

  if (error) throw new Error(error.message)

  return { data: data as Species[], count }
}

export const useSpecies = (page: number = 1, pageSize: number = 100) => {
  const { orgId } = useUserStore()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["species", orgId, page, pageSize],
    queryFn: async () => {
      if (!orgId) {
        throw new Error("Organisation not found")
      }
      return getSpecies(orgId, page, pageSize)
    },
    enabled: Boolean(orgId),
  })

  return {
    data: data?.data,
    count: data?.count,
    isLoading,
    isError,
    error,
  }
}
