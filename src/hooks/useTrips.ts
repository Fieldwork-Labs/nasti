import { getTrips } from "@/queries/trips"
import useUserStore from "@/store/userStore"
import { useQuery } from "@tanstack/react-query"

export const useTrips = () => {
  const { orgId } = useUserStore()
  // Fetch trips
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trips", orgId],
    queryFn: async () => {
      if (!orgId) {
        throw new Error("Organisation not found")
      }
      return getTrips(orgId)
    },
    enabled: Boolean(orgId),
  })
  return { data, isLoading, isError, error }
}
