import { Species } from "@nasti/common/types"

import { rowToSpecies } from "@/lib/powersync/rows"
import type { PowerSyncSpeciesRow } from "@/lib/powersync/schema"
import { useQuery } from "@powersync/tanstack-react-query"

export const useSpecies = (speciesId?: string) => {
  const query = useQuery<PowerSyncSpeciesRow>({
    queryKey: ["species", "byIds", [speciesId]],
    query: "SELECT * FROM species WHERE id = ?",
    parameters: [speciesId ?? ""],
    enabled: Boolean(speciesId),
  })

  const row = query.data?.[0]
  const data: Species | null | undefined = speciesId
    ? row
      ? rowToSpecies(row)
      : null
    : null

  return { ...query, data }
}
