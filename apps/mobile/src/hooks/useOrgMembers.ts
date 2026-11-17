import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { useAuth } from "@/hooks/useAuth"
import { fetchOrgMembers, orgMembersQueryKey } from "@/lib/orgMembers"
import { getOrgMembersCache } from "@/lib/orgMembersCache"

export const useOrgMembers = () => {
  const { user } = useAuth()
  const cache = getOrgMembersCache(useQueryClient())
  const enabled = useSyncExternalStore(cache.subscribe, () =>
    cache.isReady(user?.id),
  )
  const query = useQuery({
    queryKey: orgMembersQueryKey(user?.id),
    queryFn: fetchOrgMembers,
    enabled,
    staleTime: 1000 * 60 * 5,
  })
  // A mounted query observer can still hold its last result after removal.
  return enabled ? query : { ...query, data: undefined }
}
