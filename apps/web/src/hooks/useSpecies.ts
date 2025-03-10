import { QueryKey, useQuery } from "@tanstack/react-query"

import { supabase } from "@/lib/supabase"
import { Species } from "@nasti/common/types"
import { useInvalidate } from "./useInvalidate"
import { queryClient } from "@/lib/utils"

export type PaginatedSpeciesList = {
  data: Species[]
  count: number
}

export const getSpeciesList = async (page: number, pageSize: number = 100) => {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from("species")
    .select("*", { count: "exact" }) // Get the total count of species
    .range(from, to)

  if (error) throw new Error(error.message)

  return { data: data as Species[], count }
}

export const useSpeciesList = (page: number = 1, pageSize: number = 100) => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["species", "list", page, pageSize],
    queryFn: async () => {
      return getSpeciesList(page, pageSize)
    },
  })

  const invalidate = useInvalidate(["species", "list", page, pageSize])

  return {
    data: data?.data,
    count: data?.count,
    isLoading,
    isError,
    error,
    invalidate,
  }
}

type QueryTuple = [QueryKey, PaginatedSpeciesList | undefined]

const findItemById = (
  queryDataArray: QueryTuple[],
  targetId: string,
): Species | undefined => {
  // Iterate through each tuple in the array
  for (const [_, speciesList] of queryDataArray) {
    if (!speciesList) continue
    const foundItem = speciesList.data.find((item) => item.id === targetId)
    if (foundItem) return foundItem
  }
  return undefined
}

export const getSpecies = async (id: string) => {
  // first attempt to get it from the global cache
  const cached = queryClient.getQueriesData<PaginatedSpeciesList>({
    queryKey: ["species", "list"],
  })
  if (cached) {
    const species = findItemById(cached, id)
    if (species) return species
  }

  const { data, error } = await supabase
    .from("species")
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw new Error(error.message)

  return data
}

export const useSpecies = (id?: string | null) => {
  return useQuery({
    queryKey: ["species", "detail", id],
    queryFn: () => (id ? getSpecies(id) : null),
    enabled: Boolean(id),
    refetchOnMount: false,
  })
}
