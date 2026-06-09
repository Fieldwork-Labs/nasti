import { Species } from "@nasti/common/types"

import { rowToSpecies } from "@/lib/powersync/rows"
import type { PowerSyncSpeciesRow } from "@/lib/powersync/schema"
import { useQuery } from "@/lib/powersync/query"

export const useSpecies = (speciesId?: string | null) => {
  const query = useQuery<PowerSyncSpeciesRow>({
    queryKey: ["species", "detail", speciesId],
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
