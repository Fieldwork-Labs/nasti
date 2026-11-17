import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { fetchOrgMembers, orgMembersQueryKey } from "@/lib/orgMembers"

export const useOrgMembers = () => {
  const { user } = useAuth()
  return useQuery({
    queryKey: orgMembersQueryKey(user?.id),
    queryFn: fetchOrgMembers,
    enabled: Boolean(user?.id),
    staleTime: 1000 * 60 * 5,
  })
}
