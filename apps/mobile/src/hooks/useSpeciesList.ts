import { Species } from "@nasti/common/types"

import { rowToSpecies } from "@/lib/powersync/rows"
import type { PowerSyncSpeciesRow } from "@/lib/powersync/schema"
import { useQuery } from "@/lib/powersync/query"

export const getSpeciesListQueryOptions = () => ({
  queryKey: ["species", "list"],
  query: "SELECT * FROM species ORDER BY name ASC",
  staleTime: 5 * 60 * 1000, // 5 minutes
})

export const useSpeciesList = () => {
  const query = useQuery<PowerSyncSpeciesRow>(getSpeciesListQueryOptions())
  const data: Species[] | undefined = query.data?.map(rowToSpecies)

  return { ...query, data }
}
