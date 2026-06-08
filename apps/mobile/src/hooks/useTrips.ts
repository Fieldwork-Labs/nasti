import { useQuery } from "@powersync/tanstack-react-query"
import type { Trip } from "@nasti/common/types"
import type { PowerSyncTripRow } from "@/lib/powersync/schema"
import { rowToTrip } from "@/lib/powersync/rows"

export const getTripsQueryOptions = () => ({
  queryKey: ["trips", "list"],
  query: "SELECT * FROM trip ORDER BY created_at ASC",
})

export const useTrips = () => {
  const query = useQuery<PowerSyncTripRow>(getTripsQueryOptions())
  const data: Trip[] | undefined = query.data?.map(rowToTrip)

  return {
    ...query,
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isPending: query.isPending,
  }
}
