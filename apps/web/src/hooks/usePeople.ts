import { useQuery } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { getUsers } from "@/queries/users"
import { queryClient } from "@/lib/utils"
import { useCallback } from "react"

export const usePeople = () => {
  const { orgId } = useUserStore()

  // Fetch people
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users", orgId],
    queryFn: async () => {
      if (!orgId) {
        throw new Error("Organisation not found")
      }
      return getUsers()
    },
    enabled: Boolean(orgId),
  })
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["users", orgId],
    })
  }, [orgId])

  return { data, isLoading, isError, error, invalidate }
}
