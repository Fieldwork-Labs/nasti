import { useQuery } from "@tanstack/react-query"

import { supabase } from "@nasti/common/supabase"
import { Organisation } from "@nasti/common/types"
import useUserStore from "@/store/userStore"

export const getOrganisation = async (
  orgId?: string,
): Promise<Organisation> => {
  if (!orgId) throw new Error("No org ID provided")
  const { data: org, error } = await supabase
    .from("organisation")
    .select()
    .eq("id", orgId)
    .single()

  if (error) throw new Error(error.message)

  return org as Organisation
}

export const getOrganisationQueryOptions = (orgId: string | null) => ({
  queryKey: ["organisation", orgId],
  queryFn: () => (orgId ? getOrganisation(orgId) : null),
  enabled: Boolean(orgId),
  refetchOnMount: false,
})

export const useOrganisation = () => {
  const { orgId } = useUserStore()
  const { data, isLoading, isError, error } = useQuery(
    getOrganisationQueryOptions(orgId),
  )

  return { data, isLoading, isError, error }
}
