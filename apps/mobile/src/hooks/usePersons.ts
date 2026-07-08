import { Person } from "@nasti/common/types"
import { useQuery } from "@/lib/powersync/query"
import type { PowerSyncPersonRow } from "@/lib/powersync/schema"
import { rowToPerson } from "@/lib/powersync/rows"

export const usePersons = (organisationId?: string | null) => {
  const query = useQuery<PowerSyncPersonRow>({
    queryKey: ["persons", organisationId],
    query: organisationId
      ? "SELECT * FROM person WHERE organisation_id = ? ORDER BY display_name ASC"
      : "SELECT * FROM person ORDER BY display_name ASC",
    parameters: organisationId ? [organisationId] : [],
  })

  return {
    ...query,
    data: query.data?.map(rowToPerson) as Person[] | undefined,
  }
}
