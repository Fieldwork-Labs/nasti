import { useQuery } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { getUsers } from "@/queries/users"
import { queryClient } from "@nasti/common/utils"
import { useCallback } from "react"

export const usePeople = () => {
  const { organisation } = useUserStore()

  // Fetch people
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users", organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) {
        throw new Error("Organisation not found")
      }
      return getUsers()
    },
    enabled: Boolean(organisation?.id),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["users", organisation?.id],
    })
  }, [organisation])

  return { data, isLoading, isError, error, invalidate }
}
