import { supabase } from "@nasti/common/supabase"
import { Collection } from "@nasti/common/types"
import { useQuery } from "@tanstack/react-query"

export type CollectionWithSpeciesAndTrip = Collection & {
  species: {
    id: string
    name: string
  } | null
} & {
  trip: {
    id: string
    name: string
  }
}

const getCollections = async ({
  page = 1,
  limit = 100,
  searchTerm,
}: CollectionsProps) => {
  const queries = []
  const getBaseQ = () =>
    supabase.from("collection").select(
      `*,species(
        id,
        name
      ),
      trip(
        id,
        name
      )`,
    )

  if (searchTerm) {
    // it's necessary to perform multiple queries, because postgres can't handle the OR operator
    // with a filter on a nested field
    queries.push(
      getBaseQ()
        .ilike("species.name", `%${searchTerm}%`)
        .not("species", "is", null)
        .range(page * limit, (page + 1) * limit)
        .order("created_at", { ascending: false }),
      getBaseQ()
        .ilike("field_name", `%${searchTerm}%`)
        .is("species_id", null)
        .range(page * limit, (page + 1) * limit)
        .order("created_at", { ascending: false }),
    )
  } else {
    queries.push(
      getBaseQ()
        .range(page * limit, (page + 1) * limit)
        .order("created_at", { ascending: false }),
    )
  }
  const querieResults = await Promise.all(queries.map(async (q) => await q))

  const error = querieResults.find(({ error }) => error)?.error
  if (error) throw new Error(error.message)

  const allData = querieResults
    .map(({ data }) => data)
    .flat()
    .filter((x): x is CollectionWithSpeciesAndTrip => Boolean(x))
  if (!allData) return []

  // uniqueness check
  const dataMap = Object.fromEntries(allData.map((x) => [x.id, x]))
  return Object.values(dataMap)
}

type CollectionsProps = {
  page: number
  limit: number
  searchTerm?: string
}
export const useCollections = ({
  page = 1,
  limit = 100,
  searchTerm,
}: CollectionsProps) => {
  return useQuery({
    queryKey: ["collections", page, limit, searchTerm],
    queryFn: () => getCollections({ page, limit, searchTerm }),
  })
}
