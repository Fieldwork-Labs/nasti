import { Species } from "@nasti/common/types"

import { rowToSpecies } from "@/lib/powersync/rows"
import type { PowerSyncSpeciesRow } from "@/lib/powersync/schema"
import { useQuery } from "@/lib/powersync/query"

export const useSpeciesForTrip = (tripId?: string) => {
  const query = useQuery<PowerSyncSpeciesRow>({
    queryKey: ["species", "byTrip", tripId],
    query: `
      SELECT s.* FROM species s
      INNER JOIN trip_species ts ON ts.species_id = s.id
      WHERE ts.trip_id = ?
      ORDER BY s.name ASC
    `,
    parameters: [tripId ?? ""],
    enabled: Boolean(tripId),
  })

  const data: Species[] | null | undefined = tripId
    ? query.data?.map(rowToSpecies)
    : null

  return { ...query, data }
}
