import { queryClient } from "@/lib/utils"
import { getTrips } from "@/queries/trips"
import useUserStore from "@/store/userStore"
import { useQuery } from "@tanstack/react-query"
import { useCallback } from "react"

export const useTrips = () => {
  const { orgId } = useUserStore()
  // Fetch trips
  const { data, isLoading, isError, error, isPending } = useQuery({
    queryKey: ["trips", orgId],
    queryFn: async () => {
      if (!orgId) {
        throw new Error("Organisation not found")
      }
      return getTrips(orgId)
    },
    enabled: Boolean(orgId),
  })
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["trips", orgId],
    })
  }, [orgId])

  return { data, isLoading, isError, error, isPending, invalidate }
}
